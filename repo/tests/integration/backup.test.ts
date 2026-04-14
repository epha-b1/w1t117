import { describe, it, expect, beforeEach } from 'vitest';
import { __resetForTests, put, getAll } from '../../src/services/db';
import { backupService } from '../../src/services/backup.service';
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

describe('backup service', () => {
  beforeEach(freshDb);

  it('exports and imports plain JSON with fingerprint check', async () => {
    await ensureFirstRunSeed();
    const [admin] = await listUsers();
    await put('leads', {
      id: 'l1',
      title: 'Test lead',
      requirements: 'x', budget: 100, availabilityStart: 1, availabilityEnd: 2,
      contactName: 'n', contactPhone: '5551234567', contactEmail: 'a@b.co',
      status: 'new', assignedTo: admin.id, lastUpdatedAt: Date.now(),
      slaFlagged: false, createdAt: Date.now(), updatedAt: Date.now(),
      history: []
    });

    const blob = await backupService.exportData(admin.id);
    const text = await blob.text();
    const file = new File([text], 'backup.json', { type: 'application/json' });

    await freshDb();
    const res = await backupService.importData(file);
    expect(res.success).toBe(true);
    const leads = await getAll('leads');
    expect(leads.some((l) => l.id === 'l1')).toBe(true);
  });

  it('rejects import with tampered fingerprint', async () => {
    await ensureFirstRunSeed();
    const [admin] = await listUsers();
    const blob = await backupService.exportData(admin.id);
    const text = await blob.text();
    const bundle = JSON.parse(text);
    bundle.sha256 = '0'.repeat(64);
    const file = new File([JSON.stringify(bundle)], 'bad.json', { type: 'application/json' });
    const res = await backupService.importData(file);
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/fingerprint/i);
  });

  it('exports encrypted and restores with correct passphrase', async () => {
    await ensureFirstRunSeed();
    const [admin] = await listUsers();
    const blob = await backupService.exportEncrypted('secret-pass', admin.id);
    const file = new File([await blob.text()], 'enc.json', { type: 'application/json' });
    await freshDb();
    const res = await backupService.importEncrypted(file, 'secret-pass');
    expect(res.success).toBe(true);
    expect(res.recordsRestored).toBeGreaterThan(0);
  });

  it('rejects encrypted restore with wrong passphrase', async () => {
    await ensureFirstRunSeed();
    const blob = await backupService.exportEncrypted('right-pass');
    const file = new File([await blob.text()], 'enc.json', { type: 'application/json' });
    const res = await backupService.importEncrypted(file, 'wrong-pass');
    expect(res.success).toBe(false);
  });

  it('rejects encrypted bundle missing required fields', async () => {
    const bad = new File([JSON.stringify({ version: '1' })], 'b.json', {
      type: 'application/json'
    });
    const res = await backupService.importEncrypted(bad, 'x');
    expect(res.success).toBe(false);
  });
});
