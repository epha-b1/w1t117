<script lang="ts">
  import type { InvoiceData } from '../../types/ledger.types';
  import { formatCurrency, formatDate, maskBankRef } from '../../utils/format';
  export let data: InvoiceData;
  function printNow() { window.print(); }
</script>

<div class="invoice">
  <button class="no-print" on:click={printNow}>Print</button>
  <h2>Invoice {data.invoiceNumber}</h2>
  <div class="meta">
    <div>Account: {data.account.id.slice(0, 8)}</div>
    <div>Bank: {maskBankRef(data.account.bankRef)}</div>
    <div>Reference: {data.account.referenceType} / {data.account.referenceId}</div>
    <div>Generated: {formatDate(data.generatedAt)}</div>
  </div>
  <table>
    <thead><tr><th>Date</th><th>Type</th><th>Note</th><th>Amount</th></tr></thead>
    <tbody>
      {#each data.entries as e}
        <tr>
          <td>{formatDate(e.createdAt)}</td>
          <td>{e.type}</td>
          <td>{e.note}</td>
          <td>{formatCurrency(e.amount)}</td>
        </tr>
      {/each}
    </tbody>
  </table>
  <div class="total">Total settled: <strong>{formatCurrency(data.totalAmount)}</strong></div>
</div>

<style>
  .invoice { padding: 24px; background: #fff; max-width: 720px; margin: 0 auto; }
  h2 { margin: 0 0 12px; }
  .meta { font-size: 13px; color: #555; margin-bottom: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { padding: 6px 8px; border-bottom: 1px solid #ddd; text-align: left; }
  th { background: #f7f7f7; }
  .total { margin-top: 16px; text-align: right; }
  .no-print { margin-bottom: 12px; padding: 6px 12px; background: #2563eb; color: #fff; border: none; border-radius: 4px; cursor: pointer; }
  @media print { .no-print { display: none; } }
</style>
