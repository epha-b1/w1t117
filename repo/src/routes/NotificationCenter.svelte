<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import AppShell from '../components/layout/AppShell.svelte';
  import Modal from '../components/common/Modal.svelte';
  import DndSettings from '../components/notifications/DndSettings.svelte';
  import { notificationService, TEMPLATES } from '../services/notification.service';
  import { session } from '../stores/session.store';
  import { formatDate } from '../utils/format';
  import { pushToast } from '../stores/toast.store';
  import type { Notification, NotificationSubscription } from '../types/notification.types';

  let list: Array<Notification & { read: boolean }> = [];
  let retryQueue: Notification[] = [];
  let unreadOnly = false;
  let subs: NotificationSubscription[] = [];
  let selected: (Notification & { read: boolean }) | null = null;
  let detailOpen = false;
  let timer: number | null = null;

  async function refresh() {
    if (!$session) return;
    list = await notificationService.listNotifications($session.userId, { unreadOnly });
    retryQueue = await notificationService.getRetryQueue($session.userId);
    subs = await notificationService.getSubscriptions($session.userId);
  }

  onMount(async () => {
    await refresh();
    if (!$session) return;
    await notificationService.flushQueued($session.userId);
    timer = window.setInterval(async () => {
      if (!$session) return;
      await notificationService.flushQueued($session.userId);
      await refresh();
    }, 60_000);
  });

  onDestroy(() => {
    if (timer) window.clearInterval(timer);
  });

  async function openDetail(n: Notification & { read: boolean }) {
    selected = n;
    detailOpen = true;
    if (!n.read && $session) {
      await notificationService.markRead(n.id, $session.userId);
      await refresh();
    }
  }

  async function markAll() {
    if (!$session) return;
    await notificationService.markAllRead($session.userId);
    await refresh();
    pushToast('All notifications marked read', 'success');
  }

  async function retryOne(id: string) {
    await notificationService.retry(id);
    await refresh();
    pushToast('Retried', 'info');
  }

  async function updateSub(eventType: string, subscribed: boolean) {
    if (!$session) return;
    await notificationService.updateSubscription($session.userId, eventType, subscribed);
    await refresh();
  }

  function handleSubChange(eventType: string, e: Event) {
    const target = e.currentTarget as HTMLInputElement;
    void updateSub(eventType, target.checked);
  }

  $: unreadCount = list.filter((n) => !n.read).length;
  $: eventTypes = Object.keys(TEMPLATES);
  $: subMap = Object.fromEntries(subs.map((s) => [s.eventType, s.subscribed]));
</script>

<AppShell pageTitle="Notifications">
  <div class="grid">
    <section>
      <div class="head">
        <h3>Inbox {#if unreadCount > 0}<span class="badge">{unreadCount}</span>{/if}</h3>
        <label class="check">
          <input type="checkbox" bind:checked={unreadOnly} on:change={refresh} />
          Unread only
        </label>
        <button on:click={markAll}>Mark all read</button>
      </div>
      <ul class="list">
        {#each list as n}
          <li class:unread={!n.read} on:click={() => openDetail(n)} role="button">
            <div class="subj">{n.renderedSubject}</div>
            <div class="meta">{formatDate(n.createdAt)} · {n.status}</div>
          </li>
        {/each}
        {#if list.length === 0}
          <li class="empty">No notifications</li>
        {/if}
      </ul>
    </section>

    <aside>
      <section>
        <h3>Retry queue</h3>
        <ul class="list">
          {#each retryQueue as n}
            <li>
              <div class="subj">{n.renderedSubject}</div>
              <div class="meta">
                {n.status === 'queued' ? 'Pending (DND)' : 'Failed'} · retries: {n.retryCount}
                <button class="link" on:click={() => retryOne(n.id)}>Retry</button>
              </div>
            </li>
          {/each}
          {#if retryQueue.length === 0}<li class="empty">Queue empty</li>{/if}
        </ul>
      </section>

      <section>
        <h3>Do Not Disturb</h3>
        <DndSettings />
      </section>

      <section>
        <h3>Subscriptions</h3>
        <ul class="subs">
          {#each eventTypes as et}
            <li>
              <label>
                <input
                  type="checkbox"
                  checked={subMap[et] !== false}
                  on:change={(e) => handleSubChange(et, e)}
                />
                {et}
              </label>
            </li>
          {/each}
        </ul>
      </section>
    </aside>
  </div>
</AppShell>

<Modal open={detailOpen} title={selected?.renderedSubject ?? ''} onClose={() => (detailOpen = false)}>
  {#if selected}
    <div class="detail">
      <div class="meta">
        {formatDate(selected.createdAt)} · {selected.status}
        {#if selected.dispatchedAt}· dispatched {formatDate(selected.dispatchedAt)}{/if}
      </div>
      <p>{selected.renderedBody}</p>
    </div>
  {/if}
</Modal>

<style>
  .grid { display: grid; grid-template-columns: 2fr 1fr; gap: 16px; }
  @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
  section { background: #fff; padding: 12px 16px; border-radius: 6px; margin-bottom: 16px; }
  .head { display: flex; gap: 10px; align-items: center; margin-bottom: 8px; }
  .head h3 { margin: 0; font-size: 15px; }
  .badge { background: #dbeafe; color: #1e3a8a; padding: 2px 8px; border-radius: 10px; font-size: 12px; }
  .check { font-size: 13px; display: flex; align-items: center; gap: 4px; margin-left: auto; }
  button { padding: 6px 12px; border: 1px solid #d1d5db; background: #fff; border-radius: 4px; cursor: pointer; font-size: 13px; }
  .list { list-style: none; margin: 0; padding: 0; }
  .list li { padding: 8px 10px; border-bottom: 1px solid #f2f2f2; cursor: pointer; }
  .list li.unread { background: #eff6ff; font-weight: 500; }
  .list li:hover { background: #fafafa; }
  .list li.empty { color: #888; text-align: center; cursor: default; }
  .subj { font-size: 14px; }
  .meta { color: #666; font-size: 12px; display: flex; gap: 8px; align-items: center; }
  button.link { background: transparent; border: none; color: #2563eb; cursor: pointer; padding: 0; font-size: 12px; }
  .subs { list-style: none; padding: 0; margin: 0; font-size: 13px; }
  .subs li { padding: 4px 0; }
  .detail p { white-space: pre-wrap; }
</style>
