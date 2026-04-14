<script lang="ts">
  import { onMount } from 'svelte';
  import AppShell from '../components/layout/AppShell.svelte';
  import Modal from '../components/common/Modal.svelte';
  import DeliveryForm from '../components/deliveries/DeliveryForm.svelte';
  import DeliveryDrawer from '../components/deliveries/DeliveryDrawer.svelte';
  import { deliveryService } from '../services/delivery.service';
  import { exportQueue } from '../services/delivery-api.service';
  import { jobService } from '../services/job.service';
  import { leadService } from '../services/lead.service';
  import type { Delivery, DeliveryStatus } from '../types/delivery.types';
  import type { Job } from '../types/job.types';
  import { session } from '../stores/session.store';
  import { pushToast } from '../stores/toast.store';
  import { formatCurrency } from '../utils/format';

  const slots = deliveryService.getAvailableSlots();

  let deliveries: Delivery[] = [];
  let view: 'list' | 'week' = 'list';
  let statusFilter: DeliveryStatus | '' = '';
  let dateFilter = '';
  let zipFilter = '';
  let createOpen = false;
  let selected: Delivery | null = null;
  let drawerOpen = false;

  let weekAnchor = new Date();

  let bulkJob: Job | null = null;
  let bulkResult: Array<{ leadId: string; title: string; depotId: string; recipientZip: string }> | null = null;
  let bulkPollTimer: number | null = null;
  let bulkDepotId = 'depot-default';

  async function refresh() {
    deliveries = await deliveryService.listDeliveries({
      status: statusFilter || undefined,
      date: dateFilter || undefined,
      recipientZip: zipFilter || undefined
    });
  }

  onMount(refresh);
  $: if (statusFilter !== undefined || dateFilter !== undefined || zipFilter !== undefined) void refresh();

  async function handleCreate(data: Parameters<typeof deliveryService.createDelivery>[0]) {
    if (!$session) return;
    try {
      const created = await deliveryService.createDelivery(data, $session.userId);
      createOpen = false;
      pushToast('Delivery created', 'success');
      await refresh();
      selected = created;
      drawerOpen = true;
    } catch (e) {
      throw e;
    }
  }

  function openDrawer(d: Delivery) {
    selected = d;
    drawerOpen = true;
  }

  async function onDrawerChange() {
    await refresh();
    if (selected) {
      selected = (await deliveryService.getDelivery(selected.id)) ?? null;
    }
  }

  function weekDates(anchor: Date): string[] {
    const start = new Date(anchor);
    start.setDate(start.getDate() - start.getDay());
    const arr: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      arr.push(d.toISOString().slice(0, 10));
    }
    return arr;
  }

  $: week = weekDates(weekAnchor);
  $: byDateSlot = deliveries.reduce<Record<string, Delivery[]>>((acc, d) => {
    if (!d.scheduledDate) return acc;
    const key = `${d.scheduledDate}|${d.scheduledSlot}`;
    (acc[key] ??= []).push(d);
    return acc;
  }, {});

  function shiftWeek(days: number) {
    const n = new Date(weekAnchor);
    n.setDate(n.getDate() + days);
    weekAnchor = n;
  }

  async function startBulkGenerate() {
    if (!$session) return;
    bulkResult = null;
    try {
      const leads = await leadService.listLeads({ status: 'confirmed' });
      const input = {
        leads: leads.map((l) => ({ id: l.id, title: l.title, recipientZip: '' })),
        depotId: bulkDepotId
      };
      const job = await jobService.enqueue('bulk_delivery', input, $session.userId);
      bulkJob = job;
      if (bulkPollTimer) window.clearInterval(bulkPollTimer);
      bulkPollTimer = window.setInterval(async () => {
        const j = await jobService.getJob(job.id);
        bulkJob = j ?? null;
        if (j && (j.status === 'completed' || j.status === 'failed')) {
          window.clearInterval(bulkPollTimer!);
          bulkPollTimer = null;
          if (j.status === 'completed') {
            bulkResult = await jobService.getJobResult(j.id);
            pushToast(`Generated ${bulkResult?.length ?? 0} delivery drafts`, 'success');
          } else {
            pushToast(j.errorMessage ?? 'Bulk generation failed', 'error');
          }
        }
      }, 150) as unknown as number;
    } catch (e) {
      pushToast((e as Error).message, 'error');
    }
  }

  async function handleExportQueue() {
    if (!$session) return;
    try {
      const blob = await exportQueue($session.userId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `delivery-api-queue-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      pushToast('Queue exported', 'success');
    } catch (e) {
      pushToast((e as Error).message, 'error');
    }
  }
</script>

<AppShell pageTitle="Delivery Calendar">
  <div class="toolbar">
    <select bind:value={view}>
      <option value="list">List view</option>
      <option value="week">Week view</option>
    </select>
    {#if view === 'list'}
      <select bind:value={statusFilter}>
        <option value="">All statuses</option>
        <option value="scheduled">Scheduled</option>
        <option value="in_transit">In transit</option>
        <option value="delivered">Delivered</option>
        <option value="exception">Exception</option>
      </select>
      <input type="date" bind:value={dateFilter} />
      <input placeholder="ZIP" bind:value={zipFilter} />
    {:else}
      <button on:click={() => shiftWeek(-7)}>← Prev</button>
      <button on:click={() => shiftWeek(7)}>Next →</button>
      <span>{week[0]} to {week[6]}</span>
    {/if}
    <div class="spacer"></div>
    <button on:click={startBulkGenerate} data-testid="bulk-generate-btn">Generate bulk drafts</button>
    <button on:click={handleExportQueue} data-testid="export-queue-btn">Export Delivery API Queue</button>
    <button class="primary" on:click={() => (createOpen = true)}>+ New delivery</button>
  </div>

  {#if bulkJob}
    <div class="bulk-status" data-testid="bulk-status">
      Bulk job: {bulkJob.status} · {bulkJob.progress}%
      {#if bulkJob.errorMessage}<span class="err">{bulkJob.errorMessage}</span>{/if}
      {#if bulkResult}
        <div class="bulk-result">{bulkResult.length} drafts generated from confirmed leads.</div>
      {/if}
    </div>
  {/if}

  <div class="help">
    Delivery adapter is offline-only — scheduling & cancellation enqueue stub responses
    that you can download via "Export Delivery API Queue". No network calls are made.
  </div>

  {#if view === 'list'}
    <table class="data-table">
      <thead>
        <tr>
          <th>Date</th><th>Slot</th><th>Recipient</th><th>ZIP</th><th>Status</th><th>Freight</th>
        </tr>
      </thead>
      <tbody>
        {#each deliveries as d}
          <tr on:click={() => openDrawer(d)} class="row">
            <td>{d.scheduledDate || '—'}</td>
            <td>{d.scheduledSlot || '—'}</td>
            <td>{d.recipientName}</td>
            <td>{d.recipientZip}</td>
            <td>{d.status}</td>
            <td>{formatCurrency(d.freightCost)}</td>
          </tr>
        {/each}
        {#if deliveries.length === 0}
          <tr><td colspan="6" class="empty">No deliveries</td></tr>
        {/if}
      </tbody>
    </table>
  {:else}
    <div class="week-grid">
      <div class="slot-col">
        <div class="head">Slot</div>
        {#each slots as s}<div class="cell slot-label">{s}</div>{/each}
      </div>
      {#each week as day}
        <div class="day-col">
          <div class="head">{day}</div>
          {#each slots as s}
            {@const key = `${day}|${s}`}
            <div class="cell">
              {#each byDateSlot[key] ?? [] as d}
                <button class="pill" on:click={() => openDrawer(d)}>{d.recipientName}</button>
              {/each}
            </div>
          {/each}
        </div>
      {/each}
    </div>
  {/if}
</AppShell>

<Modal open={createOpen} title="New delivery" onClose={() => (createOpen = false)}>
  <DeliveryForm onSubmit={handleCreate} onCancel={() => (createOpen = false)} />
</Modal>

<DeliveryDrawer
  open={drawerOpen}
  delivery={selected}
  onClose={() => (drawerOpen = false)}
  onChange={onDrawerChange}
/>

<style>
  .toolbar { display: flex; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; align-items: center; }
  .toolbar select, .toolbar input, .toolbar button {
    padding: 6px 10px; border: 1px solid #d1d5db; border-radius: 4px; background: #fff; cursor: pointer;
  }
  .spacer { flex: 1; }
  button.primary {
    background: #2563eb !important; color: #fff !important; border: none !important;
    padding: 8px 14px !important;
  }
  .data-table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 6px; overflow: hidden; }
  th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #eee; font-size: 14px; }
  th { background: #f7f7f7; font-weight: 600; }
  .row { cursor: pointer; }
  .row:hover td { background: #fafafa; }
  .empty { text-align: center; color: #888; padding: 24px; }
  .week-grid {
    display: grid;
    grid-template-columns: 80px repeat(7, 1fr);
    background: #fff;
    border-radius: 6px;
    overflow: hidden;
    font-size: 12px;
  }
  .head { padding: 6px 8px; background: #f7f7f7; font-weight: 600; border-bottom: 1px solid #eee; text-align: center; }
  .cell { padding: 4px 6px; border-bottom: 1px solid #f2f2f2; min-height: 28px; display: flex; flex-wrap: wrap; gap: 2px; }
  .slot-label { font-weight: 500; color: #555; background: #fafafa; justify-content: flex-end; }
  .pill {
    background: #dbeafe;
    border: none;
    border-radius: 3px;
    padding: 2px 6px;
    font-size: 11px;
    cursor: pointer;
  }
  .bulk-status {
    background: #fff7ed;
    border: 1px solid #fed7aa;
    padding: 6px 10px;
    border-radius: 4px;
    font-size: 13px;
    margin-bottom: 8px;
  }
  .bulk-result { font-size: 12px; margin-top: 4px; }
  .help { font-size: 12px; color: #6b7280; margin-bottom: 8px; }
  .err { color: #991b1b; margin-left: 6px; }
</style>
