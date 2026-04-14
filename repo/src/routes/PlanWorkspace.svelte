<script lang="ts">
  import { onMount } from 'svelte';
  import AppShell from '../components/layout/AppShell.svelte';
  import Modal from '../components/common/Modal.svelte';
  import Drawer from '../components/common/Drawer.svelte';
  import BomEditor from '../components/plans/BomEditor.svelte';
  import BomDiff from '../components/plans/BomDiff.svelte';
  import { planService } from '../services/plan.service';
  import { jobService } from '../services/job.service';
  import type {
    Plan,
    PlanVersion,
    PlanWithBom,
    ShareToken,
    BomDiff as BomDiffType,
    PlanStatus
  } from '../types/plan.types';
  import type { Job } from '../types/job.types';
  import { session } from '../stores/session.store';
  import { pushToast } from '../stores/toast.store';
  import { formatDate } from '../utils/format';

  let plans: Plan[] = [];
  let statusFilter: PlanStatus | '' = '';
  let tagFilter = '';
  let searchQuery = '';
  let createOpen = false;
  let createTitle = '';
  let createTags = '';

  let activePlan: PlanWithBom | null = null;
  let drawerOpen = false;
  let versions: PlanVersion[] = [];
  let shareTokens: ShareToken[] = [];

  let saveVersionOpen = false;
  let versionNote = '';

  let compareOpen = false;
  let compareA = '';
  let compareB = '';
  let compareDiff: BomDiffType | null = null;
  let compareJobId: string | null = null;
  let compareJob: Job | null = null;
  let comparePollTimer: number | null = null;

  let shareOpen = false;
  let shareDays = 7;
  let shareLink = '';

  async function refreshPlans() {
    plans = await planService.listPlans({
      status: statusFilter || undefined,
      tag: tagFilter || undefined,
      search: searchQuery || undefined
    });
  }

  async function openPlan(plan: Plan) {
    const full = await planService.getPlan(plan.id);
    activePlan = full ?? null;
    versions = activePlan ? await planService.listVersions(plan.id) : [];
    shareTokens = activePlan ? await planService.listShareTokens(plan.id) : [];
    drawerOpen = true;
  }

  async function refreshActive() {
    if (!activePlan) return;
    activePlan = (await planService.getPlan(activePlan.id)) ?? null;
    if (activePlan) {
      versions = await planService.listVersions(activePlan.id);
      shareTokens = await planService.listShareTokens(activePlan.id);
    }
  }

  async function createPlan() {
    if (!$session) return;
    const tags = createTags.split(',').map((t) => t.trim()).filter(Boolean);
    const plan = await planService.createPlan(
      { title: createTitle, tags },
      $session.userId
    );
    createOpen = false;
    createTitle = '';
    createTags = '';
    await refreshPlans();
    await openPlan(plan);
    pushToast('Plan created', 'success');
  }

  async function copyActive() {
    if (!activePlan || !$session) return;
    const copy = await planService.copyPlan(
      activePlan.id,
      activePlan.title + ' (copy)',
      $session.userId
    );
    await refreshPlans();
    await openPlan(copy);
    pushToast('Plan copied', 'success');
  }

  async function archiveActive() {
    if (!activePlan || !$session) return;
    await planService.updatePlan(activePlan.id, { status: 'archived' }, $session.userId);
    await refreshActive();
    await refreshPlans();
    pushToast('Plan archived', 'info');
  }

  async function submitVersion() {
    if (!activePlan || !$session) return;
    try {
      await planService.saveVersion(activePlan.id, versionNote, $session.userId);
      saveVersionOpen = false;
      versionNote = '';
      await refreshActive();
      pushToast('Version saved', 'success');
    } catch (e) {
      pushToast((e as Error).message, 'error');
    }
  }

  async function rollbackTo(v: PlanVersion) {
    if (!activePlan || !$session) return;
    if (!confirm(`Rollback to version ${v.version}? Current working BOM will be replaced.`)) return;
    await planService.rollback(activePlan.id, v.id, $session.userId);
    await refreshActive();
    pushToast(`Rolled back to version ${v.version}`, 'success');
  }

  async function runCompare() {
    if (!compareA || !compareB || !$session) return;
    compareDiff = null;
    compareJob = null;
    const vA = versions.find((v) => v.id === compareA);
    const vB = versions.find((v) => v.id === compareB);
    if (!vA || !vB) return;
    try {
      const job = await jobService.enqueue(
        'bom_compare',
        { a: vA.bom, b: vB.bom },
        $session.userId
      );
      compareJobId = job.id;
      await pollCompareJob();
    } catch (e) {
      pushToast((e as Error).message, 'error');
    }
  }

  async function pollCompareJob() {
    if (!compareJobId) return;
    if (comparePollTimer) window.clearInterval(comparePollTimer);
    comparePollTimer = window.setInterval(async () => {
      if (!compareJobId) return;
      const job = await jobService.getJob(compareJobId);
      compareJob = job ?? null;
      if (!job) return;
      if (job.status === 'completed') {
        const result = await jobService.getJobResult<BomDiffType>(job.id);
        compareDiff = result;
        stopPolling();
      } else if (job.status === 'failed') {
        pushToast(job.errorMessage ?? 'Compare failed', 'error');
        stopPolling();
      }
    }, 150) as unknown as number;
  }

  function stopPolling() {
    if (comparePollTimer) {
      window.clearInterval(comparePollTimer);
      comparePollTimer = null;
    }
  }

  async function issueShare() {
    if (!activePlan || !$session) return;
    const t = await planService.generateShareToken(activePlan.id, shareDays, $session.userId);
    shareLink = `${location.origin}${location.pathname}#/share/${t.token}`;
    shareTokens = await planService.listShareTokens(activePlan.id);
  }

  async function revokeShare(t: ShareToken) {
    if (!$session) return;
    await planService.revokeShareToken(t.id, $session.userId);
    shareTokens = await planService.listShareTokens(activePlan!.id);
  }

  onMount(refreshPlans);
  $: if (statusFilter !== undefined || tagFilter !== undefined) void refreshPlans();
</script>

<AppShell pageTitle="Plan Workspace">
  <div class="toolbar">
    <input placeholder="Search title / tag" bind:value={searchQuery} on:input={refreshPlans} />
    <select bind:value={statusFilter}>
      <option value="">All</option>
      <option value="draft">Draft</option>
      <option value="active">Active</option>
      <option value="archived">Archived</option>
    </select>
    <input placeholder="Tag filter" bind:value={tagFilter} on:input={refreshPlans} />
    <div class="spacer"></div>
    <button class="primary" on:click={() => (createOpen = true)}>+ New plan</button>
  </div>

  <table class="data-table">
    <thead>
      <tr><th>Title</th><th>Status</th><th>Version</th><th>Tags</th><th>Updated</th></tr>
    </thead>
    <tbody>
      {#each plans as p}
        <tr on:click={() => openPlan(p)} class="row">
          <td>{p.title}</td>
          <td>{p.status}</td>
          <td>v{p.currentVersion}</td>
          <td>{p.tags.join(', ')}</td>
          <td>{formatDate(p.updatedAt)}</td>
        </tr>
      {/each}
      {#if plans.length === 0}
        <tr><td colspan="5" class="empty">No plans</td></tr>
      {/if}
    </tbody>
  </table>
</AppShell>

<Modal open={createOpen} title="New plan" onClose={() => (createOpen = false)}>
  <form on:submit|preventDefault={createPlan} class="form">
    <label>Title<input bind:value={createTitle} required /></label>
    <label>Tags (comma-separated)<input bind:value={createTags} /></label>
    <div class="actions">
      <button type="button" on:click={() => (createOpen = false)}>Cancel</button>
      <button type="submit" class="primary">Create</button>
    </div>
  </form>
</Modal>

<Drawer open={drawerOpen} title={activePlan?.title ?? ''} onClose={() => (drawerOpen = false)}>
  {#if activePlan}
    <div class="head">
      <div>Status: {activePlan.status} · v{activePlan.currentVersion}</div>
      <div class="drawer-actions">
        <button on:click={() => (saveVersionOpen = true)}>Save version</button>
        <button on:click={copyActive}>Copy</button>
        <button on:click={archiveActive}>Archive</button>
        <button on:click={() => (shareOpen = true)}>Share</button>
        <button on:click={() => (compareOpen = true)}>Compare</button>
      </div>
    </div>

    <h4>BOM (working copy)</h4>
    <BomEditor
      planId={activePlan.id}
      items={activePlan.bom}
      onChange={refreshActive}
    />

    <h4>Versions</h4>
    <table class="vers">
      <thead><tr><th>Version</th><th>Note</th><th>Saved</th><th></th></tr></thead>
      <tbody>
        {#each versions as v}
          <tr>
            <td>v{v.version}</td>
            <td>{v.changeNote}</td>
            <td>{formatDate(v.savedAt)}</td>
            <td><button class="link" on:click={() => rollbackTo(v)}>Rollback</button></td>
          </tr>
        {/each}
        {#if versions.length === 0}<tr><td colspan="4" class="empty">No versions yet</td></tr>{/if}
      </tbody>
    </table>
  {/if}
</Drawer>

<Modal open={saveVersionOpen} title="Save version" onClose={() => (saveVersionOpen = false)}>
  <form on:submit|preventDefault={submitVersion} class="form">
    <label>Change note<textarea bind:value={versionNote} rows="3" required /></label>
    <div class="actions">
      <button type="button" on:click={() => (saveVersionOpen = false)}>Cancel</button>
      <button type="submit" class="primary">Save version</button>
    </div>
  </form>
</Modal>

<Modal open={compareOpen} title="Compare versions" onClose={() => { compareOpen = false; compareDiff = null; compareJob = null; compareJobId = null; stopPolling(); }}>
  <div class="form" style="min-width: 420px">
    <label>Version A
      <select bind:value={compareA}>
        <option value="">—</option>
        {#each versions as v}<option value={v.id}>v{v.version} · {v.changeNote}</option>{/each}
      </select>
    </label>
    <label>Version B
      <select bind:value={compareB}>
        <option value="">—</option>
        {#each versions as v}<option value={v.id}>v{v.version} · {v.changeNote}</option>{/each}
      </select>
    </label>
    <button class="primary" on:click={runCompare} disabled={!compareA || !compareB || (compareJob && compareJob.status === 'running')}>
      {compareJob && (compareJob.status === 'queued' || compareJob.status === 'running') ? 'Running…' : 'Compute diff (async)'}
    </button>
    {#if compareJob}
      <div class="job-status" data-testid="compare-job-status">
        Job {compareJob.status} · {compareJob.progress}%
        {#if compareJob.errorMessage}<span class="err">{compareJob.errorMessage}</span>{/if}
      </div>
    {/if}
    {#if compareDiff}<BomDiff diff={compareDiff} />{/if}
  </div>
</Modal>

<Modal open={shareOpen} title="Share plan" onClose={() => (shareOpen = false)}>
  <div class="form" style="min-width: 420px">
    <label>Valid for (days)<input type="number" min="1" max="90" bind:value={shareDays} /></label>
    <button class="primary" on:click={issueShare}>Generate link</button>
    {#if shareLink}
      <div class="share-link">
        <code>{shareLink}</code>
      </div>
    {/if}
    {#if shareTokens.length}
      <h4>Existing tokens</h4>
      <ul class="tokens">
        {#each shareTokens as t}
          <li>
            <span class="token">{t.token.slice(0, 8)}…</span>
            {#if t.revoked}
              <span class="muted">revoked</span>
            {:else if t.expiresAt < Date.now()}
              <span class="muted">expired</span>
            {:else}
              expires {formatDate(t.expiresAt)}
              <button class="link" on:click={() => revokeShare(t)}>Revoke</button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</Modal>

<style>
  .toolbar { display: flex; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; align-items: center; }
  .toolbar input, .toolbar select { padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 4px; }
  .spacer { flex: 1; }
  button.primary {
    background: #2563eb; color: #fff; border: none;
    padding: 8px 14px; border-radius: 4px; cursor: pointer;
  }
  .data-table, .vers { width: 100%; border-collapse: collapse; background: #fff; border-radius: 6px; overflow: hidden; }
  th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #eee; font-size: 14px; }
  th { background: #f7f7f7; font-weight: 600; }
  .row { cursor: pointer; }
  .row:hover td { background: #fafafa; }
  .empty { text-align: center; color: #888; }
  .head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; font-size: 13px; }
  .drawer-actions { display: flex; gap: 6px; flex-wrap: wrap; }
  .drawer-actions button { padding: 4px 10px; border: 1px solid #d1d5db; background: #fff; border-radius: 4px; cursor: pointer; font-size: 12px; }
  h4 { margin: 16px 0 6px; font-size: 14px; }
  .form { display: flex; flex-direction: column; gap: 10px; }
  .form label { display: flex; flex-direction: column; font-size: 13px; gap: 4px; }
  .form input, .form textarea, .form select {
    padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 4px; font-family: inherit;
  }
  .actions { display: flex; justify-content: flex-end; gap: 8px; }
  .actions button { padding: 8px 14px; border: 1px solid #d1d5db; border-radius: 4px; background: #fff; cursor: pointer; }
  .actions button.primary { background: #2563eb; color: #fff; border-color: #2563eb; }
  .share-link { background: #f3f4f6; padding: 8px; border-radius: 4px; word-break: break-all; font-size: 12px; }
  .tokens { list-style: none; padding: 0; margin: 0; }
  .tokens li { display: flex; gap: 10px; align-items: center; padding: 4px 0; font-size: 13px; }
  .muted { color: #888; font-style: italic; }
  .token { font-family: monospace; }
  button.link { background: transparent; border: none; color: #2563eb; cursor: pointer; }
  .job-status { font-size: 12px; color: #555; }
  .err { color: #991b1b; margin-left: 6px; }
</style>
