import { getAll, getAllByIndex, get, put } from './db';
import { uid } from '../utils/uid';
import type {
  DndSettings,
  Notification,
  NotificationRead,
  NotificationStatus,
  NotificationSubscription
} from '../types/notification.types';
import { authorize, can } from './authz.service';

export interface NotificationTemplate {
  id: string;
  subject: string;
  body: string;
}

export const TEMPLATES: Record<string, NotificationTemplate> = {
  lead_assigned: {
    id: 'lead_assigned',
    subject: 'New lead assigned: {{leadTitle}}',
    body: 'Lead {{leadTitle}} has been assigned to you.'
  },
  lead_status_new_in_discussion: {
    id: 'lead_status_new_in_discussion',
    subject: 'Lead in discussion',
    body: 'Lead {{leadTitle}} is now In Discussion.'
  },
  lead_status_quoted_confirmed: {
    id: 'lead_status_quoted_confirmed',
    subject: 'Lead confirmed',
    body: 'Lead {{leadTitle}} has been Confirmed — ready for planning.'
  },
  lead_status_closed: {
    id: 'lead_status_closed',
    subject: 'Lead closed',
    body: 'Lead {{leadTitle}} has been Closed.'
  },
  lead_status_default: {
    id: 'lead_status_default',
    subject: 'Lead status changed',
    body: 'Lead {{leadTitle}} moved to {{status}}.'
  },
  lead_sla_overdue: {
    id: 'lead_sla_overdue',
    subject: 'SLA overdue',
    body: 'Lead {{leadTitle}} has no update in 24 hours.'
  },
  plan_saved: {
    id: 'plan_saved',
    subject: 'Plan version saved',
    body: 'Plan {{planTitle}} saved as version {{version}}.'
  },
  delivery_scheduled: {
    id: 'delivery_scheduled',
    subject: 'Delivery scheduled',
    body: 'Delivery {{deliveryId}} scheduled for {{date}} at {{slot}}.'
  },
  job_long_running: {
    id: 'job_long_running',
    subject: 'Long-running job',
    body: 'Job {{jobId}} has exceeded 30 seconds.'
  },
  job_error_rate: {
    id: 'job_error_rate',
    subject: 'Job error rate high',
    body: 'Job error rate is {{rate}}% across the last 50 jobs.'
  }
};

function render(template: NotificationTemplate, variables: Record<string, string>) {
  const subject = substitute(template.subject, variables);
  const body = substitute(template.body, variables);
  return { subject, body };
}

function substitute(str: string, vars: Record<string, string>): string {
  return str.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
}

export function isInDndWindow(now: Date, dnd: DndSettings): boolean {
  if (!dnd.enabled) return false;
  const mins = now.getHours() * 60 + now.getMinutes();
  const start = dnd.startHour * 60 + dnd.startMinute;
  const end = dnd.endHour * 60 + dnd.endMinute;
  if (start === end) return false;
  if (start < end) return mins >= start && mins < end;
  // window crosses midnight
  return mins >= start || mins < end;
}

async function getDnd(userId: string): Promise<DndSettings> {
  const existing = await get('notification_dnd', userId);
  return (
    existing ?? {
      userId,
      startHour: 21,
      startMinute: 0,
      endHour: 7,
      endMinute: 0,
      enabled: false
    }
  );
}

export async function getDndSettings(userId: string): Promise<DndSettings> {
  return await getDnd(userId);
}

export async function updateDndSettings(userId: string, settings: DndSettings): Promise<void> {
  await authorize(userId, 'notification:settings');
  await put('notification_dnd', { ...settings, userId });
}

export async function getSubscriptions(userId: string): Promise<NotificationSubscription[]> {
  const all = await getAll('notification_subscriptions');
  return all.filter((s) => s.userId === userId);
}

export async function updateSubscription(
  userId: string,
  eventType: string,
  subscribed: boolean
): Promise<void> {
  await authorize(userId, 'notification:settings');
  await put('notification_subscriptions', { userId, eventType, subscribed });
}

async function isSubscribed(userId: string, eventType: string): Promise<boolean> {
  const subs = await getSubscriptions(userId);
  const sub = subs.find((s) => s.eventType === eventType);
  if (!sub) return true; // subscribed by default
  return sub.subscribed;
}

export async function dispatch(
  eventType: string,
  recipientId: string,
  variables: Record<string, string>
): Promise<Notification> {
  const now = Date.now();
  const template = TEMPLATES[eventType];

  // Failure branch 1: unknown event type has no template — cannot render
  if (!template) {
    const failed: Notification = {
      id: uid(),
      templateId: eventType,
      eventType,
      variables,
      recipientId,
      status: 'failed',
      dispatchedAt: null,
      retryCount: 0,
      createdAt: now,
      renderedSubject: `(undeliverable: unknown template "${eventType}")`,
      renderedBody: ''
    };
    await put('notifications', failed);
    return failed;
  }

  // Failure branch 2: missing or invalid recipient
  if (!recipientId || typeof recipientId !== 'string') {
    const failed: Notification = {
      id: uid(),
      templateId: template.id,
      eventType,
      variables,
      recipientId: recipientId ?? '',
      status: 'failed',
      dispatchedAt: null,
      retryCount: 0,
      createdAt: now,
      renderedSubject: '(undeliverable: missing recipient)',
      renderedBody: ''
    };
    await put('notifications', failed);
    return failed;
  }

  const { subject, body } = render(template, variables);
  const subscribed = await isSubscribed(recipientId, eventType);
  const dnd = await getDnd(recipientId);
  const inDnd = isInDndWindow(new Date(now), dnd);

  let status: NotificationStatus = 'queued';
  let dispatchedAt: number | null = null;
  if (!subscribed) {
    status = 'dispatched';
    dispatchedAt = now;
  } else if (inDnd) {
    status = 'queued';
  } else {
    status = 'dispatched';
    dispatchedAt = now;
  }

  const notification: Notification = {
    id: uid(),
    templateId: template.id,
    eventType,
    variables,
    recipientId,
    status,
    dispatchedAt,
    retryCount: 0,
    createdAt: now,
    renderedSubject: subject,
    renderedBody: body
  };
  await put('notifications', notification);
  return notification;
}

export async function listNotifications(
  userId: string,
  filters: { unreadOnly?: boolean } = {}
): Promise<Array<Notification & { read: boolean }>> {
  const all = await getAllByIndex('notifications', 'by_recipient', userId);
  const reads = await getAllByIndex('notification_reads', 'by_user', userId);
  const readSet = new Set(reads.map((r) => r.notificationId));
  return all
    .map((n) => ({ ...n, read: readSet.has(n.id) }))
    .filter((n) => (filters.unreadOnly ? !n.read : true))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function markRead(notificationId: string, userId: string): Promise<void> {
  const existing = await getAllByIndex('notification_reads', 'by_notification', notificationId);
  if (existing.some((r) => r.userId === userId)) return;
  const record: NotificationRead = {
    id: uid(),
    notificationId,
    userId,
    readAt: Date.now()
  };
  await put('notification_reads', record);
}

export async function markAllRead(userId: string): Promise<void> {
  const list = await listNotifications(userId);
  for (const n of list) {
    if (!n.read) await markRead(n.id, userId);
  }
}

export async function getRetryQueue(userId: string): Promise<Notification[]> {
  const all = await getAllByIndex('notifications', 'by_recipient', userId);
  return all.filter((n) => n.status === 'failed' || n.status === 'queued');
}

export async function retry(notificationId: string): Promise<void> {
  const n = await get('notifications', notificationId);
  if (!n) return;
  const dnd = await getDnd(n.recipientId);
  const inDnd = isInDndWindow(new Date(), dnd);
  const updated: Notification = {
    ...n,
    status: inDnd ? 'queued' : 'dispatched',
    dispatchedAt: inDnd ? null : Date.now(),
    retryCount: n.retryCount + 1
  };
  await put('notifications', updated);
}

export async function flushQueued(userId: string): Promise<number> {
  const all = await getAllByIndex('notifications', 'by_recipient', userId);
  const dnd = await getDnd(userId);
  if (isInDndWindow(new Date(), dnd)) return 0;
  let n = 0;
  for (const note of all) {
    if (note.status === 'queued') {
      await put('notifications', {
        ...note,
        status: 'dispatched',
        dispatchedAt: Date.now()
      });
      n++;
    }
  }
  return n;
}

export const notificationService = {
  dispatch,
  listNotifications,
  markRead,
  markAllRead,
  getRetryQueue,
  retry,
  flushQueued,
  getDndSettings,
  updateDndSettings,
  getSubscriptions,
  updateSubscription,
  TEMPLATES
};
