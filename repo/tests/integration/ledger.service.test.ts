import { describe, it, expect, beforeEach } from 'vitest';
import { __resetForTests } from '../../src/services/db';
import { ledgerService } from '../../src/services/ledger.service';
import { ensureFirstRunSeed, listUsers } from '../../src/services/auth.service';
import { clearSession } from '../../src/stores/session.store';

async function freshDb() {
  await __resetForTests();
  clearSession();
  localStorage.clear();
  const req = indexedDB.deleteDatabase('forgeops');
  await new Promise<void>((resolve) => {
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

describe('ledger service', () => {
  beforeEach(async () => {
    await freshDb();
    await ensureFirstRunSeed();
  });

  it('creates account with masked bank reference', async () => {
    const [admin] = await listUsers();
    const acct = await ledgerService.createAccount('lead-1', 'lead', '1234567890', admin.id);
    expect(acct.balance).toBe(0);
    expect(ledgerService.maskBankRef(acct.bankRef)).toBe('****7890');
  });

  it('deposits, freezes, and settles funds', async () => {
    const [admin] = await listUsers();
    const acct = await ledgerService.createAccount('o-1', 'order', '9999', admin.id);
    await ledgerService.depositToAccount(acct.id, 100_00, admin.id);
    const frozen = await ledgerService.freeze(acct.id, 60, admin.id);
    expect(frozen.amount).toBe(60_00);
    await ledgerService.settle(acct.id, 40, 'milestone', 'Phase 1', admin.id);
    const a = await ledgerService.getAccount(acct.id);
    expect(a?.balance).toBe(60_00); // 100 - 40
    expect(a?.frozenAmount).toBe(20_00); // 60 - 40
  });

  it('rejects freeze exceeding available balance', async () => {
    const [admin] = await listUsers();
    const acct = await ledgerService.createAccount('o-2', 'order', '1111', admin.id);
    await ledgerService.depositToAccount(acct.id, 50_00, admin.id);
    await expect(ledgerService.freeze(acct.id, 60, admin.id)).rejects.toThrow(/insufficient/i);
  });

  it('settle rejects > frozenAmount', async () => {
    const [admin] = await listUsers();
    const acct = await ledgerService.createAccount('o-3', 'order', '2222', admin.id);
    await ledgerService.depositToAccount(acct.id, 100_00, admin.id);
    await ledgerService.freeze(acct.id, 20, admin.id);
    await expect(ledgerService.settle(acct.id, 30, 'one_time', null, admin.id)).rejects.toThrow();
  });

  it('processes partial and full refunds', async () => {
    const [admin] = await listUsers();
    const acct = await ledgerService.createAccount('o-4', 'order', '3333', admin.id);
    await ledgerService.depositToAccount(acct.id, 200_00, admin.id);
    const e1 = await ledgerService.refund(acct.id, 50, admin.id, 'partial');
    const e2 = await ledgerService.refund(acct.id, 150, admin.id, 'full remainder');
    expect(e1.amount).toBe(50_00);
    expect(e2.amount).toBe(150_00);
  });

  it('withdraws from available balance only', async () => {
    const [admin] = await listUsers();
    const acct = await ledgerService.createAccount('o-5', 'order', '4444', admin.id);
    await ledgerService.depositToAccount(acct.id, 100_00, admin.id);
    await ledgerService.freeze(acct.id, 70, admin.id);
    await expect(ledgerService.withdraw(acct.id, 40, admin.id)).rejects.toThrow();
    await ledgerService.withdraw(acct.id, 20, admin.id);
    const a = await ledgerService.getAccount(acct.id);
    expect(a?.balance).toBe(80_00);
    expect(a?.frozenAmount).toBe(70_00);
  });

  it('generates invoice summing only settlements', async () => {
    const [admin] = await listUsers();
    const acct = await ledgerService.createAccount('o-6', 'order', '5555', admin.id);
    await ledgerService.depositToAccount(acct.id, 100_00, admin.id);
    await ledgerService.freeze(acct.id, 50, admin.id);
    await ledgerService.settle(acct.id, 30, 'one_time', null, admin.id);
    await ledgerService.refund(acct.id, 10, admin.id);
    const inv = await ledgerService.generateInvoice(acct.id);
    expect(inv.totalAmount).toBe(30_00);
  });
});
