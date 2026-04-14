import { get, getAll, getAllByIndex, put } from './db';
import { uid } from '../utils/uid';
import { getNextAssignee as pickNextAssignee } from '../utils/round-robin';
import { sanitizeText, validateEmail, validatePhone, validateBudget } from '../utils/validation';
import { lsGet, lsSet, LS_KEYS } from '../utils/local-storage';
import type { CreateLeadInput, Lead, LeadFilters, LeadStatus } from '../types/lead.types';
import type { User } from '../types/auth.types';
import * as audit from './audit.service';
import * as notif from './notification.service';
import { authorize } from './authz.service';

const SLA_MS = 24 * 60 * 60 * 1000;

const STATUS_FLOW: Record<LeadStatus, LeadStatus[]> = {
  new: ['in_discussion', 'closed'],
  in_discussion: ['quoted', 'closed'],
  quoted: ['confirmed', 'closed'],
  confirmed: ['closed'],
  closed: []
};

export async function getNextAssignee(): Promise<string | null> {
  const users = (await getAll('users')) as User[];
  const coordinators = users.filter((u) => u.role === 'sales_coordinator' && u.isActive);
  const lastMap = lsGet<Record<string, number>>(LS_KEYS.ROUND_ROBIN) ?? {};
  const pick = pickNextAssignee(coordinators, lastMap);
  if (pick) return pick;
  const admin = users.find((u) => u.role === 'administrator' && u.isActive);
  return admin?.id ?? null;
}

function recordAssignment(userId: string) {
  const map = lsGet<Record<string, number>>(LS_KEYS.ROUND_ROBIN) ?? {};
  map[userId] = Date.now();
  lsSet(LS_KEYS.ROUND_ROBIN, map);
}

export async function createLead(input: CreateLeadInput, actorId: string): Promise<Lead> {
  await authorize(actorId, 'lead:create');
  const title = sanitizeText(input.title);
  const requirements = sanitizeText(input.requirements);
  const contactName = sanitizeText(input.contactName);
  const contactPhone = sanitizeText(input.contactPhone);
  const contactEmail = sanitizeText(input.contactEmail);
  if (!title) throw new Error('Title is required');
  if (!requirements) throw new Error('Requirements are required');
  if (!validateBudget(input.budget)) throw new Error('Budget must be a positive number');
  if (!validateEmail(contactEmail)) throw new Error('Contact email is invalid');
  if (!validatePhone(contactPhone)) throw new Error('Contact phone is invalid');
  if (!input.availabilityStart || !input.availabilityEnd) {
    throw new Error('Availability window is required');
  }
  if (input.availabilityEnd < input.availabilityStart) {
    throw new Error('Availability end must be after start');
  }

  const assignedTo = (await getNextAssignee()) ?? actorId;
  const now = Date.now();
  const lead: Lead = {
    id: uid(),
    title,
    requirements,
    budget: Number(input.budget),
    availabilityStart: input.availabilityStart,
    availabilityEnd: input.availabilityEnd,
    contactName,
    contactPhone,
    contactEmail,
    status: 'new',
    assignedTo,
    lastUpdatedAt: now,
    slaFlagged: false,
    createdAt: now,
    updatedAt: now,
    history: [
      {
        timestamp: now,
        actor: actorId,
        fromStatus: null,
        toStatus: 'new',
        note: 'Lead created'
      }
    ]
  };
  await put('leads', lead);
  recordAssignment(assignedTo);
  await audit.log({
    actor: actorId,
    action: 'lead_created',
    resourceType: 'lead',
    resourceId: lead.id,
    detail: { assignedTo, title }
  });
  await notif.dispatch('lead_assigned', assignedTo, { leadTitle: title, leadId: lead.id });
  return lead;
}

export async function getLead(id: string): Promise<Lead | undefined> {
  return await get('leads', id);
}

export async function listLeads(filters: LeadFilters = {}): Promise<Lead[]> {
  let leads: Lead[];
  if (filters.status) {
    leads = await getAllByIndex('leads', 'by_status', filters.status);
  } else if (filters.assignedTo) {
    leads = await getAllByIndex('leads', 'by_assignedTo', filters.assignedTo);
  } else {
    leads = await getAll('leads');
  }
  const q = filters.search?.trim().toLowerCase();
  return leads
    .filter((l) => {
      if (filters.status && l.status !== filters.status) return false;
      if (filters.assignedTo && l.assignedTo !== filters.assignedTo) return false;
      if (filters.slaFlagged != null && l.slaFlagged !== filters.slaFlagged) return false;
      if (q) {
        const hay =
          (l.title + ' ' + l.contactName + ' ' + l.contactEmail + ' ' + l.requirements).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function updateLead(
  id: string,
  patch: Partial<Omit<Lead, 'id' | 'history' | 'createdAt'>>,
  actorId: string
): Promise<Lead> {
  await authorize(actorId, 'lead:update');
  const lead = await getLead(id);
  if (!lead) throw new Error('Lead not found');
  const now = Date.now();
  const updated: Lead = {
    ...lead,
    ...patch,
    id: lead.id,
    history: lead.history,
    createdAt: lead.createdAt,
    lastUpdatedAt: now,
    updatedAt: now,
    slaFlagged: false
  };
  await put('leads', updated);
  await audit.log({
    actor: actorId,
    action: 'lead_updated',
    resourceType: 'lead',
    resourceId: lead.id,
    detail: { fields: Object.keys(patch) }
  });
  return updated;
}

export async function transitionStatus(
  id: string,
  newStatus: LeadStatus,
  actorId: string,
  note = ''
): Promise<Lead> {
  await authorize(actorId, 'lead:status');
  const lead = await getLead(id);
  if (!lead) throw new Error('Lead not found');
  const allowed = STATUS_FLOW[lead.status];
  if (!allowed.includes(newStatus)) {
    throw new Error(`Cannot transition from ${lead.status} to ${newStatus}`);
  }
  const now = Date.now();
  const history = [
    ...lead.history,
    { timestamp: now, actor: actorId, fromStatus: lead.status, toStatus: newStatus, note: sanitizeText(note) }
  ];
  const updated: Lead = {
    ...lead,
    status: newStatus,
    history,
    lastUpdatedAt: now,
    updatedAt: now,
    slaFlagged: false
  };
  await put('leads', updated);
  await audit.log({
    actor: actorId,
    action: 'lead_status_change',
    resourceType: 'lead',
    resourceId: lead.id,
    detail: { from: lead.status, to: newStatus }
  });
  const eventType = pickEventType(lead.status, newStatus);
  await notif.dispatch(eventType, lead.assignedTo, {
    leadTitle: lead.title,
    leadId: lead.id,
    status: newStatus
  });
  return updated;
}

function pickEventType(from: LeadStatus, to: LeadStatus): string {
  if (from === 'new' && to === 'in_discussion') return 'lead_status_new_in_discussion';
  if (from === 'quoted' && to === 'confirmed') return 'lead_status_quoted_confirmed';
  if (to === 'closed') return 'lead_status_closed';
  return 'lead_status_default';
}

export async function checkSlaFlags(now: number = Date.now()): Promise<number> {
  const leads = await getAll('leads');
  let flagged = 0;
  for (const lead of leads) {
    if (lead.status === 'closed') continue;
    const isOverdue = now - lead.lastUpdatedAt > SLA_MS;
    if (isOverdue && !lead.slaFlagged) {
      await put('leads', { ...lead, slaFlagged: true, updatedAt: now });
      await notif.dispatch('lead_sla_overdue', lead.assignedTo, {
        leadTitle: lead.title,
        leadId: lead.id
      });
      flagged++;
    }
  }
  return flagged;
}

export const leadService = {
  createLead,
  getLead,
  listLeads,
  updateLead,
  transitionStatus,
  checkSlaFlags,
  getNextAssignee,
  STATUS_FLOW
};
