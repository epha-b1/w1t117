<script lang="ts">
  import type { VoucherData } from '../../types/ledger.types';
  import { formatCurrency, formatDate, maskBankRef } from '../../utils/format';
  export let data: VoucherData;
  function printNow() { window.print(); }
</script>

<div class="voucher">
  <button class="no-print" on:click={printNow}>Print</button>
  <h2>Voucher {data.voucherNumber}</h2>
  <dl>
    <dt>Account</dt><dd>{data.account.id.slice(0, 8)}</dd>
    <dt>Bank</dt><dd>{maskBankRef(data.account.bankRef)}</dd>
    <dt>Type</dt><dd>{data.entry.type}</dd>
    <dt>Amount</dt><dd>{formatCurrency(data.entry.amount)}</dd>
    {#if data.entry.milestoneLabel}
      <dt>Milestone</dt><dd>{data.entry.milestoneLabel}</dd>
    {/if}
    <dt>Note</dt><dd>{data.entry.note || '—'}</dd>
    <dt>Recorded</dt><dd>{formatDate(data.entry.createdAt)}</dd>
  </dl>
</div>

<style>
  .voucher { padding: 24px; background: #fff; max-width: 480px; margin: 0 auto; }
  h2 { margin: 0 0 12px; }
  dl { display: grid; grid-template-columns: 140px 1fr; gap: 6px 12px; font-size: 14px; }
  dt { font-weight: 600; color: #555; }
  dd { margin: 0; }
  .no-print { margin-bottom: 12px; padding: 6px 12px; background: #2563eb; color: #fff; border: none; border-radius: 4px; cursor: pointer; }
  @media print { .no-print { display: none; } }
</style>
