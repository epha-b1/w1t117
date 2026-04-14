import { describe, it, expect, beforeEach } from 'vitest';
import { __resetForTests, put } from '../../src/services/db';
import { leadService } from '../../src/services/lead.service';
import { register, ensureFirstRunSeed, listUsers } from '../../src/services/auth.service';
import { clearSession } from '../../src/stores/session.store';
import { listEntries } from '../../src/services/audit.service';
import type { CreateLeadInput } from '../../src/types/lead.types';

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

const validInput: CreateLeadInput = {
  title: 'Need bracket',
  requirements: 'Custom steel bracket',
  budget: 500,
  availabilityStart: Date.now(),
  availabilityEnd: Date.now() + 7 * 24 * 3600_000,
  contactName: 'Jane',
  contactPhone: '555-111-2222',
  contactEmail: 'jane@example.com'
};

describe('lead service', () => {
  beforeEach(freshDb);

  it('creates lead, assigns to sole Sales Coordinator', async () => {
    await ensureFirstRunSeed();
    const [admin] = await listUsers();
    const sc = await register('sc1', 'pass1234', 'sales_coordinator', admin.id);
    const lead = await leadService.createLead(validInput, admin.id);
    expect(lead.assignedTo).toBe(sc.id);
    expect(lead.status).toBe('new');
    expect(lead.history).toHaveLength(1);
  });

  it('falls back to admin when no active sales coordinator', async () => {
    await ensureFirstRunSeed();
    const [admin] = await listUsers();
    const lead = await leadService.createLead(validInput, admin.id);
    expect(lead.assignedTo).toBe(admin.id);
  });

  it('distributes leads round-robin across coordinators', async () => {
    await ensureFirstRunSeed();
    const [admin] = await listUsers();
    const a = await register('a', 'pass1234', 'sales_coordinator', admin.id);
    const b = await register('b', 'pass1234', 'sales_coordinator', admin.id);
    const l1 = await leadService.createLead(validInput, admin.id);
    const l2 = await leadService.createLead(validInput, admin.id);
    const l3 = await leadService.createLead(validInput, admin.id);
    const assignees = new Set([l1.assignedTo, l2.assignedTo, l3.assignedTo]);
    expect(assignees.has(a.id)).toBe(true);
    expect(assignees.has(b.id)).toBe(true);
  });

  it('validates required fields', async () => {
    await ensureFirstRunSeed();
    const [admin] = await listUsers();
    await expect(
      leadService.createLead({ ...validInput, contactEmail: 'bad' }, admin.id)
    ).rejects.toThrow(/email/i);
  });

  it('transitions status with audit and notification', async () => {
    await ensureFirstRunSeed();
    const [admin] = await listUsers();
    const lead = await leadService.createLead(validInput, admin.id);
    const updated = await leadService.transitionStatus(lead.id, 'in_discussion', admin.id, 'call made');
    expect(updated.status).toBe('in_discussion');
    const audit = await listEntries({ action: 'lead_status_change' });
    expect(audit.length).toBeGreaterThan(0);
  });

  it('rejects illegal status transitions', async () => {
    await ensureFirstRunSeed();
    const [admin] = await listUsers();
    const lead = await leadService.createLead(validInput, admin.id);
    await expect(
      leadService.transitionStatus(lead.id, 'confirmed', admin.id)
    ).rejects.toThrow(/cannot transition/i);
  });

  it('flags SLA overdue leads when lastUpdatedAt > 24h old', async () => {
    await ensureFirstRunSeed();
    const [admin] = await listUsers();
    const lead = await leadService.createLead(validInput, admin.id);
    const stale = { ...lead, lastUpdatedAt: Date.now() - 25 * 3600_000 };
    await put('leads', stale);
    const flagged = await leadService.checkSlaFlags();
    expect(flagged).toBe(1);
    const refreshed = await leadService.getLead(lead.id);
    expect(refreshed?.slaFlagged).toBe(true);
  });

  it('clears SLA flag after update', async () => {
    await ensureFirstRunSeed();
    const [admin] = await listUsers();
    const lead = await leadService.createLead(validInput, admin.id);
    await put('leads', { ...lead, slaFlagged: true });
    const updated = await leadService.updateLead(lead.id, { title: 'x' }, admin.id);
    expect(updated.slaFlagged).toBe(false);
  });
});
