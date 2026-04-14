<script lang="ts">
  import { onMount } from 'svelte';
  import { jobService } from '../../services/job.service';
  import { session } from '../../stores/session.store';
  import ProgressBar from '../common/ProgressBar.svelte';
  import type { Job } from '../../types/job.types';
  import { formatDate } from '../../utils/format';

  let jobs: Job[] = [];
  const unsubscribe = jobService.jobsStore.subscribe((v) => (jobs = v));

  onMount(async () => {
    await jobService.initJobStore();
    return unsubscribe;
  });

  async function handleCancel(jobId: string) {
    if (!$session) return;
    try {
      await jobService.cancel(jobId, $session.userId);
    } catch (e) {
      console.error(e);
    }
  }
</script>

<div class="jobs">
  <div class="head">
    <h3>Async Job Queue</h3>
    <span class="hint">
      Jobs are triggered from Plan Workspace (BOM compare), Delivery Calendar
      (bulk delivery generation), and Ledger (reconciliation).
    </span>
  </div>
  <table>
    <thead>
      <tr><th>Type</th><th>Status</th><th>Progress</th><th>Runtime</th><th>Actions</th></tr>
    </thead>
    <tbody>
      {#each jobs as job (job.id)}
        <tr>
          <td>{job.type}</td>
          <td>{job.status}</td>
          <td class="prog">
            <ProgressBar value={job.progress} />
            <span>{job.progress}%</span>
          </td>
          <td>
            {#if job.runtimeMs}{(job.runtimeMs / 1000).toFixed(1)}s
            {:else if job.startedAt}running since {formatDate(job.startedAt)}{:else}—{/if}
          </td>
          <td>
            {#if job.status === 'running'}
              <button on:click={() => jobService.pause(job.id)}>Pause</button>
              <button on:click={() => handleCancel(job.id)}>Cancel</button>
            {:else if job.status === 'paused'}
              <button on:click={() => jobService.resume(job.id)}>Resume</button>
              <button on:click={() => handleCancel(job.id)}>Cancel</button>
            {/if}
            {#if job.errorMessage}<span class="err">{job.errorMessage}</span>{/if}
          </td>
        </tr>
      {/each}
      {#if jobs.length === 0}
        <tr><td colspan="5" class="empty">No jobs yet</td></tr>
      {/if}
    </tbody>
  </table>
</div>

<style>
  .jobs { background: #fff; padding: 12px 16px; border-radius: 6px; }
  .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .head h3 { margin: 0; font-size: 15px; }
  .hint { font-size: 12px; color: #6b7280; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { padding: 6px 10px; border-bottom: 1px solid #eee; text-align: left; }
  th { background: #f7f7f7; font-weight: 600; }
  .prog { display: flex; align-items: center; gap: 8px; min-width: 180px; }
  .prog :global(.progress) { flex: 1; }
  .empty { text-align: center; color: #888; }
  button { padding: 4px 10px; border: 1px solid #d1d5db; background: #fff; border-radius: 4px; cursor: pointer; font-size: 12px; margin-right: 4px; }
  .err { color: #991b1b; font-size: 12px; }
</style>
