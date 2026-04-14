<script lang="ts">
  import { onMount } from 'svelte';
  import AppShell from '../components/layout/AppShell.svelte';
  import Drawer from '../components/common/Drawer.svelte';
  import { listEntries } from '../services/audit.service';
  import type { AuditEntry } from '../types/db.types';
  import { formatDate } from '../utils/format';

  let entries: AuditEntry[] = [];
  let actor = '';
  let action = '';
  let resourceType = '';
  let fromDate = '';
  let toDate = '';
  let drawerOpen = false;
  let selected: AuditEntry | null = null;

  async function refresh() {
    entries = await listEntries({
      actor: actor || undefined,
      action: action || undefined,
      resourceType: resourceType || undefined,
      from: fromDate ? new Date(fromDate).getTime() : undefined,
      to: toDate ? new Date(toDate).getTime() + 86_400_000 : undefined
    });
  }

  onMount(refresh);

  function openDrawer(e: AuditEntry) {
    selected = e;
    drawerOpen = true;
  }
</script>

<AppShell pageTitle="Audit Log">
  <div class="filters">
    <input placeholder="Actor" bind:value={actor} />
    <input placeholder="Action" bind:value={action} />
    <input placeholder="Resource type" bind:value={resourceType} />
    <input type="date" bind:value={fromDate} />
    <input type="date" bind:value={toDate} />
    <button on:click={refresh}>Apply</button>
  </div>
  <table class="data-table">
    <thead>
      <tr><th>Timestamp</th><th>Actor</th><th>Action</th><th>Resource</th></tr>
    </thead>
    <tbody>
      {#each entries as e}
        <tr on:click={() => openDrawer(e)} class="row">
          <td>{formatDate(e.timestamp)}</td>
          <td>{e.actor}</td>
          <td>{e.action}</td>
          <td>{e.resourceType}:{e.resourceId.slice(0, 8)}</td>
        </tr>
      {/each}
      {#if entries.length === 0}
        <tr><td colspan="4" class="empty">No entries match current filters</td></tr>
      {/if}
    </tbody>
  </table>
</AppShell>

<Drawer open={drawerOpen} title="Audit entry" onClose={() => (drawerOpen = false)}>
  {#if selected}
    <dl>
      <dt>When</dt><dd>{formatDate(selected.timestamp)}</dd>
      <dt>Actor</dt><dd>{selected.actor}</dd>
      <dt>Action</dt><dd>{selected.action}</dd>
      <dt>Resource</dt><dd>{selected.resourceType} / {selected.resourceId}</dd>
    </dl>
    <h4>Detail</h4>
    <pre>{JSON.stringify(selected.detail, null, 2)}</pre>
  {/if}
</Drawer>

<style>
  .filters {
    display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap;
  }
  .filters input, .filters button {
    padding: 6px 10px; border: 1px solid #d1d5db; border-radius: 4px; background: #fff;
  }
  .filters button { background: #2563eb; color: #fff; cursor: pointer; border: none; padding: 6px 14px; }
  .data-table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 6px; overflow: hidden; }
  th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #eee; font-size: 13px; }
  th { background: #f7f7f7; font-weight: 600; }
  .row { cursor: pointer; }
  .row:hover td { background: #fafafa; }
  .empty { text-align: center; color: #888; padding: 24px; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; }
  dt { font-weight: 600; color: #555; font-size: 13px; }
  dd { margin: 0; font-size: 13px; }
  h4 { font-size: 14px; margin: 12px 0 4px; }
  pre { background: #f3f4f6; padding: 10px; border-radius: 4px; font-size: 12px; white-space: pre-wrap; word-break: break-all; }
</style>
