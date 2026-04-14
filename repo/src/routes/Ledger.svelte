<script lang="ts">
  import { onMount } from 'svelte';
  import AppShell from '../components/layout/AppShell.svelte';
  import Modal from '../components/common/Modal.svelte';
  import Drawer from '../components/common/Drawer.svelte';
  import InvoicePrint from '../components/ledger/InvoicePrint.svelte';
  import VoucherPrint from '../components/ledger/VoucherPrint.svelte';
  import { ledgerService } from '../services/ledger.service';
  import type { InvoiceData, LedgerAccount, LedgerEntry, VoucherData } from '../types/ledger.types';
  import { session, currentRole } from '../stores/session.store';
  import { pushToast } from '../stores/toast.store';
  import { formatCurrency, formatDate, maskBankRef } from '../utils/format';

  let accounts: LedgerAccount[] = [];
  let selected: LedgerAccount | null = null;
  let entries: LedgerEntry[] = [];
  let drawerOpen = false;

  let createOpen = false;
  let newRef = '';
  let newBank = '';
  let newType: 'lead' | 'order' = 'order';
  let openingBalance = 0;

  let opType: 'freeze' | 'unfreeze' | 'settle' | 'refund' | 'withdraw' | 'deposit' = 'deposit';
  let opAmount = 0;
  let opNote = '';
  let settlementType: 'milestone' | 'one_time' = 'one_time';
  let milestoneLabel = '';

  let invoiceData: InvoiceData | null = null;
  let voucherData: VoucherData | null = null;
  let invoiceOpen = false;
  let voucherOpen = false;

  $: isReadOnly = $currentRole === 'auditor';

  async function refresh() {
    accounts = await ledgerService.listAccounts();
  }

  async function openAccount(acct: LedgerAccount) {
    selected = acct;
    entries = await ledgerService.listEntries(acct.id);
    drawerOpen = true;
  }

  async function refreshActive() {
    if (!selected) return;
    const latest = await ledgerService.getAccount(selected.id);
    selected = latest ?? null;
    if (selected) entries = await ledgerService.listEntries(selected.id);
    await refresh();
  }

  async function createAccount() {
    if (!$session) return;
    await ledgerService.createAccount(newRef, newType, newBank, $session.userId, openingBalance);
    createOpen = false;
    newRef = '';
    newBank = '';
    openingBalance = 0;
    await refresh();
    pushToast('Account created', 'success');
  }

  async function runOp() {
    if (!selected || !$session) return;
    try {
      switch (opType) {
        case 'deposit':
          await ledgerService.depositToAccount(
            selected.id, Math.round(Number(opAmount) * 100), $session.userId, opNote);
          break;
        case 'freeze':
          await ledgerService.freeze(selected.id, opAmount, $session.userId, opNote); break;
        case 'unfreeze':
          await ledgerService.unfreeze(selected.id, opAmount, $session.userId, opNote); break;
        case 'settle':
          await ledgerService.settle(
            selected.id, opAmount, settlementType,
            settlementType === 'milestone' ? milestoneLabel : null,
            $session.userId, opNote); break;
        case 'refund':
          await ledgerService.refund(selected.id, opAmount, $session.userId, opNote); break;
        case 'withdraw':
          await ledgerService.withdraw(selected.id, opAmount, $session.userId, opNote); break;
      }
      opAmount = 0;
      opNote = '';
      milestoneLabel = '';
      await refreshActive();
      pushToast('Operation recorded', 'success');
    } catch (e) {
      pushToast((e as Error).message, 'error');
    }
  }

  async function showInvoice() {
    if (!selected) return;
    invoiceData = await ledgerService.generateInvoice(selected.id);
    invoiceOpen = true;
  }

  async function showVoucher(e: LedgerEntry) {
    voucherData = await ledgerService.generateVoucher(e.id);
    voucherOpen = true;
  }

  onMount(refresh);
</script>

<AppShell pageTitle="Ledger">
  <div class="toolbar">
    <div class="spacer"></div>
    {#if !isReadOnly}
      <button class="primary" on:click={() => (createOpen = true)}>+ New account</button>
    {/if}
  </div>

  <table class="data-table">
    <thead>
      <tr><th>Account</th><th>Reference</th><th>Bank</th><th>Balance</th><th>Frozen</th><th>Available</th></tr>
    </thead>
    <tbody>
      {#each accounts as a}
        <tr on:click={() => openAccount(a)} class="row">
          <td>{a.id.slice(0, 8)}</td>
          <td>{a.referenceType}: {a.referenceId}</td>
          <td>{maskBankRef(a.bankRef)}</td>
          <td>{formatCurrency(a.balance)}</td>
          <td>{formatCurrency(a.frozenAmount)}</td>
          <td>{formatCurrency(a.balance - a.frozenAmount)}</td>
        </tr>
      {/each}
      {#if accounts.length === 0}
        <tr><td colspan="6" class="empty">No ledger accounts</td></tr>
      {/if}
    </tbody>
  </table>
</AppShell>

<Modal open={createOpen} title="New ledger account" onClose={() => (createOpen = false)}>
  <form on:submit|preventDefault={createAccount} class="form">
    <label>Reference ID (lead/order)<input bind:value={newRef} required /></label>
    <label>Reference type
      <select bind:value={newType}>
        <option value="order">Order</option>
        <option value="lead">Lead</option>
      </select>
    </label>
    <label>Bank reference<input bind:value={newBank} required /></label>
    <label>Opening balance ($)<input type="number" min="0" step="0.01" bind:value={openingBalance} /></label>
    <div class="actions">
      <button type="button" on:click={() => (createOpen = false)}>Cancel</button>
      <button type="submit" class="primary">Create</button>
    </div>
  </form>
</Modal>

<Drawer open={drawerOpen} title={selected ? `Account ${selected.id.slice(0, 8)}` : ''} onClose={() => (drawerOpen = false)}>
  {#if selected}
    <dl>
      <dt>Reference</dt><dd>{selected.referenceType}: {selected.referenceId}</dd>
      <dt>Bank</dt><dd>{maskBankRef(selected.bankRef)}</dd>
      <dt>Balance</dt><dd>{formatCurrency(selected.balance)}</dd>
      <dt>Frozen</dt><dd>{formatCurrency(selected.frozenAmount)}</dd>
      <dt>Available</dt><dd>{formatCurrency(selected.balance - selected.frozenAmount)}</dd>
    </dl>

    {#if !isReadOnly}
      <h4>Operation</h4>
      <div class="op">
        <select bind:value={opType}>
          <option value="deposit">Deposit</option>
          <option value="freeze">Freeze</option>
          <option value="unfreeze">Unfreeze</option>
          <option value="settle">Settle</option>
          <option value="refund">Refund</option>
          <option value="withdraw">Withdraw</option>
        </select>
        <input type="number" min="0" step="0.01" placeholder="Amount ($)" bind:value={opAmount} />
        {#if opType === 'settle'}
          <select bind:value={settlementType}>
            <option value="one_time">One-time</option>
            <option value="milestone">Milestone</option>
          </select>
          {#if settlementType === 'milestone'}
            <input placeholder="Milestone label" bind:value={milestoneLabel} />
          {/if}
        {/if}
        <input placeholder="Note" bind:value={opNote} />
        <button on:click={runOp}>Record</button>
      </div>
    {/if}

    <h4>Entries</h4>
    <table class="entries">
      <thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Note</th><th></th></tr></thead>
      <tbody>
        {#each entries as e}
          <tr>
            <td>{formatDate(e.createdAt)}</td>
            <td>{e.type}{e.milestoneLabel ? ` (${e.milestoneLabel})` : ''}</td>
            <td>{formatCurrency(e.amount)}</td>
            <td>{e.note}</td>
            <td><button class="link" on:click={() => showVoucher(e)}>Voucher</button></td>
          </tr>
        {/each}
        {#if entries.length === 0}<tr><td colspan="5" class="empty">No entries</td></tr>{/if}
      </tbody>
    </table>

    <div class="drawer-actions">
      <button on:click={showInvoice}>Generate invoice</button>
    </div>
  {/if}
</Drawer>

<Modal open={invoiceOpen} title="Invoice" onClose={() => (invoiceOpen = false)}>
  {#if invoiceData}<InvoicePrint data={invoiceData} />{/if}
</Modal>

<Modal open={voucherOpen} title="Voucher" onClose={() => (voucherOpen = false)}>
  {#if voucherData}<VoucherPrint data={voucherData} />{/if}
</Modal>

<style>
  .toolbar { display: flex; margin-bottom: 12px; align-items: center; }
  .spacer { flex: 1; }
  button.primary { background: #2563eb; color: #fff; border: none; padding: 8px 14px; border-radius: 4px; cursor: pointer; }
  .data-table, .entries { width: 100%; border-collapse: collapse; background: #fff; border-radius: 6px; overflow: hidden; }
  th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #eee; font-size: 14px; }
  th { background: #f7f7f7; font-weight: 600; }
  .row { cursor: pointer; }
  .row:hover td { background: #fafafa; }
  .empty { text-align: center; color: #888; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; margin: 0 0 16px; }
  dt { font-weight: 600; color: #555; font-size: 13px; }
  dd { margin: 0; font-size: 14px; }
  h4 { margin: 16px 0 6px; font-size: 14px; }
  .op { display: grid; grid-template-columns: 110px 110px 1fr 110px; gap: 6px; margin-bottom: 10px; }
  .op select, .op input, .op button {
    padding: 6px 8px;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    font-size: 13px;
  }
  .op button { background: #2563eb; color: #fff; border: none; cursor: pointer; }
  .form { display: flex; flex-direction: column; gap: 10px; min-width: 360px; }
  .form label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
  .form input, .form select { padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 4px; }
  .actions { display: flex; justify-content: flex-end; gap: 8px; }
  .actions button { padding: 8px 14px; border: 1px solid #d1d5db; border-radius: 4px; background: #fff; cursor: pointer; }
  .actions button.primary { background: #2563eb; color: #fff; border-color: #2563eb; }
  .drawer-actions { margin-top: 12px; display: flex; gap: 6px; }
  .drawer-actions button { padding: 6px 12px; border: 1px solid #d1d5db; background: #fff; cursor: pointer; border-radius: 4px; }
  button.link { background: transparent; border: none; color: #2563eb; cursor: pointer; padding: 0; font-size: 12px; }
</style>
