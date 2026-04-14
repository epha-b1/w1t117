<script lang="ts">
  import type { BomDiff, BomItem } from '../../types/plan.types';
  import { formatCurrency } from '../../utils/format';
  export let diff: BomDiff;
  function field(item: BomItem, key: string): string {
    const v = (item as unknown as Record<string, unknown>)[key];
    return v == null ? '' : String(v);
  }
</script>

<div class="diff">
  <section>
    <h4>Added ({diff.added.length})</h4>
    {#each diff.added as item}
      <div class="row added">
        <strong>{item.partNumber}</strong> · {item.description} · qty {item.quantity} · {formatCurrency(Math.round(item.unitCost * 100))}
      </div>
    {/each}
    {#if diff.added.length === 0}<p class="empty">None</p>{/if}
  </section>

  <section>
    <h4>Removed ({diff.removed.length})</h4>
    {#each diff.removed as item}
      <div class="row removed">
        <strong>{item.partNumber}</strong> · {item.description}
      </div>
    {/each}
    {#if diff.removed.length === 0}<p class="empty">None</p>{/if}
  </section>

  <section>
    <h4>Modified ({diff.modified.length})</h4>
    {#each diff.modified as m}
      <div class="row modified">
        <strong>{m.before.partNumber}</strong>
        <div class="changes">
          {#each m.changedFields as f}
            <div class="change">
              {f}: <span class="before">{field(m.before, f)}</span>
              → <span class="after">{field(m.after, f)}</span>
            </div>
          {/each}
        </div>
      </div>
    {/each}
    {#if diff.modified.length === 0}<p class="empty">None</p>{/if}
  </section>
</div>

<style>
  .diff { display: flex; flex-direction: column; gap: 12px; }
  section h4 { margin: 0 0 6px; font-size: 14px; }
  .row { padding: 6px 10px; border-radius: 4px; font-size: 13px; margin-bottom: 4px; }
  .added { background: #dcfce7; }
  .removed { background: #fee2e2; }
  .modified { background: #fef3c7; }
  .empty { color: #999; font-size: 13px; margin: 0; }
  .changes { margin-top: 4px; font-size: 12px; }
  .before { text-decoration: line-through; color: #991b1b; }
  .after { color: #166534; font-weight: 600; }
</style>
