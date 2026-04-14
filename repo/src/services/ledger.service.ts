import { get, getAll, getAllByIndex, put } from './db';
import { uid } from '../utils/uid';
import { sanitizeText } from '../utils/validation';
import { maskBankRef as maskFormat } from '../utils/format';
import type {
  InvoiceData,
  LedgerAccount,
  LedgerEntry,
  LedgerEntryType,
  SettlementType,
  VoucherData
} from '../types/ledger.types';
import * as audit from './audit.service';
import { authorize } from './authz.service';

export function toCents(amount: number): number {
  return Math.round(Number(amount) * 100);
}

export function assertPositive(cents: number): void {
  if (!Number.isFinite(cents) || cents <= 0) throw new Error('Amount must be positive');
}

export function availableBalance(balance: number, frozen: number): number {
  return balance - frozen;
}

export async function createAccount(
  referenceId: string,
  referenceType: 'lead' | 'order',
  bankRef: string,
  actorId: string,
  openingBalance = 0
): Promise<LedgerAccount> {
  await authorize(actorId, 'ledger:create');
  const acct: LedgerAccount = {
    id: uid(),
    referenceId,
    referenceType,
    balance: toCents(openingBalance),
    frozenAmount: 0,
    status: 'active',
    bankRef: sanitizeText(bankRef),
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  await put('ledger_accounts', acct);
  await audit.log({
    actor: actorId,
    action: 'ledger_account_created',
    resourceType: 'ledger_account',
    resourceId: acct.id,
    detail: { referenceId, referenceType }
  });
  return acct;
}

export async function getAccount(id: string): Promise<LedgerAccount | undefined> {
  return await get('ledger_accounts', id);
}

export async function listAccounts(filters: { referenceType?: string } = {}): Promise<LedgerAccount[]> {
  const all = await getAll('ledger_accounts');
  return all
    .filter((a) => (filters.referenceType ? a.referenceType === filters.referenceType : true))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function depositToAccount(
  accountId: string,
  cents: number,
  actorId: string,
  note = ''
): Promise<LedgerAccount> {
  await authorize(actorId, 'ledger:mutate');
  assertPositive(cents);
  const acct = await getAccount(accountId);
  if (!acct) throw new Error('Account not found');
  const updated: LedgerAccount = {
    ...acct,
    balance: acct.balance + cents,
    updatedAt: Date.now()
  };
  await put('ledger_accounts', updated);
  await audit.log({
    actor: actorId,
    action: 'ledger_deposit',
    resourceType: 'ledger_account',
    resourceId: accountId,
    detail: { cents, note }
  });
  return updated;
}

async function writeEntry(
  accountId: string,
  type: LedgerEntryType,
  cents: number,
  createdBy: string,
  milestoneLabel: string | null,
  note: string
): Promise<LedgerEntry> {
  const entry: LedgerEntry = {
    id: uid(),
    accountId,
    type,
    amount: cents,
    milestoneLabel,
    status: 'completed',
    createdBy,
    createdAt: Date.now(),
    note: sanitizeText(note)
  };
  await put('ledger_entries', entry);
  return entry;
}

export async function freeze(
  accountId: string,
  amount: number,
  actorId: string,
  note = ''
): Promise<LedgerEntry> {
  await authorize(actorId, 'ledger:mutate');
  const cents = toCents(amount);
  assertPositive(cents);
  const acct = await getAccount(accountId);
  if (!acct) throw new Error('Account not found');
  const available = acct.balance - acct.frozenAmount;
  if (cents > available) throw new Error('Insufficient available balance');
  const updated: LedgerAccount = {
    ...acct,
    frozenAmount: acct.frozenAmount + cents,
    updatedAt: Date.now()
  };
  await put('ledger_accounts', updated);
  const entry = await writeEntry(accountId, 'freeze', cents, actorId, null, note);
  await audit.log({
    actor: actorId,
    action: 'ledger_freeze',
    resourceType: 'ledger_account',
    resourceId: accountId,
    detail: { cents }
  });
  return entry;
}

export async function unfreeze(
  accountId: string,
  amount: number,
  actorId: string,
  note = ''
): Promise<LedgerEntry> {
  await authorize(actorId, 'ledger:mutate');
  const cents = toCents(amount);
  assertPositive(cents);
  const acct = await getAccount(accountId);
  if (!acct) throw new Error('Account not found');
  if (cents > acct.frozenAmount) throw new Error('Cannot unfreeze more than frozen');
  const updated: LedgerAccount = {
    ...acct,
    frozenAmount: acct.frozenAmount - cents,
    updatedAt: Date.now()
  };
  await put('ledger_accounts', updated);
  const entry = await writeEntry(accountId, 'unfreeze', cents, actorId, null, note);
  await audit.log({
    actor: actorId,
    action: 'ledger_unfreeze',
    resourceType: 'ledger_account',
    resourceId: accountId,
    detail: { cents }
  });
  return entry;
}

export async function settle(
  accountId: string,
  amount: number,
  type: SettlementType,
  milestoneLabel: string | null,
  actorId: string,
  note = ''
): Promise<LedgerEntry> {
  await authorize(actorId, 'ledger:mutate');
  const cents = toCents(amount);
  assertPositive(cents);
  const acct = await getAccount(accountId);
  if (!acct) throw new Error('Account not found');
  if (cents > acct.frozenAmount) {
    throw new Error('Settlement amount exceeds frozen funds');
  }
  const updated: LedgerAccount = {
    ...acct,
    balance: acct.balance - cents,
    frozenAmount: acct.frozenAmount - cents,
    updatedAt: Date.now()
  };
  await put('ledger_accounts', updated);
  const label = type === 'milestone' ? milestoneLabel ?? 'milestone' : 'one_time';
  const entry = await writeEntry(accountId, 'settlement', cents, actorId, label, note);
  await audit.log({
    actor: actorId,
    action: 'ledger_settle',
    resourceType: 'ledger_account',
    resourceId: accountId,
    detail: { cents, type }
  });
  return entry;
}

export async function refund(
  accountId: string,
  amount: number,
  actorId: string,
  note = ''
): Promise<LedgerEntry> {
  await authorize(actorId, 'ledger:mutate');
  const cents = toCents(amount);
  assertPositive(cents);
  const acct = await getAccount(accountId);
  if (!acct) throw new Error('Account not found');
  const entry = await writeEntry(accountId, 'refund', cents, actorId, null, note);
  await put('ledger_accounts', { ...acct, updatedAt: Date.now() });
  await audit.log({
    actor: actorId,
    action: 'ledger_refund',
    resourceType: 'ledger_account',
    resourceId: accountId,
    detail: { cents }
  });
  return entry;
}

export async function withdraw(
  accountId: string,
  amount: number,
  actorId: string,
  note = ''
): Promise<LedgerEntry> {
  await authorize(actorId, 'ledger:mutate');
  const cents = toCents(amount);
  assertPositive(cents);
  const acct = await getAccount(accountId);
  if (!acct) throw new Error('Account not found');
  const available = acct.balance - acct.frozenAmount;
  if (cents > available) throw new Error('Insufficient available balance for withdrawal');
  const updated: LedgerAccount = {
    ...acct,
    balance: acct.balance - cents,
    updatedAt: Date.now()
  };
  await put('ledger_accounts', updated);
  const entry = await writeEntry(accountId, 'withdrawal', cents, actorId, null, note);
  await audit.log({
    actor: actorId,
    action: 'ledger_withdraw',
    resourceType: 'ledger_account',
    resourceId: accountId,
    detail: { cents }
  });
  return entry;
}

export async function listEntries(accountId: string): Promise<LedgerEntry[]> {
  const entries = await getAllByIndex('ledger_entries', 'by_account', accountId);
  return entries.sort((a, b) => b.createdAt - a.createdAt);
}

export async function collectAllEntries(actorId: string): Promise<LedgerEntry[]> {
  await authorize(actorId, 'ledger:reconcile');
  return await getAll('ledger_entries');
}

export async function generateInvoice(accountId: string): Promise<InvoiceData> {
  const account = await getAccount(accountId);
  if (!account) throw new Error('Account not found');
  const entries = await listEntries(accountId);
  const totalAmount = entries
    .filter((e) => e.type === 'settlement')
    .reduce((sum, e) => sum + e.amount, 0);
  return {
    invoiceNumber: `INV-${account.id.slice(0, 8).toUpperCase()}`,
    account,
    entries,
    totalAmount,
    generatedAt: Date.now()
  };
}

export async function generateVoucher(entryId: string): Promise<VoucherData> {
  const entry = await get('ledger_entries', entryId);
  if (!entry) throw new Error('Entry not found');
  const account = await getAccount(entry.accountId);
  if (!account) throw new Error('Account not found');
  return {
    voucherNumber: `VCH-${entry.id.slice(0, 8).toUpperCase()}`,
    entry,
    account,
    generatedAt: Date.now()
  };
}

export function maskBankRef(ref: string): string {
  return maskFormat(ref);
}

export const ledgerService = {
  createAccount,
  getAccount,
  listAccounts,
  depositToAccount,
  freeze,
  unfreeze,
  settle,
  refund,
  withdraw,
  listEntries,
  collectAllEntries,
  generateInvoice,
  generateVoucher,
  maskBankRef
};
