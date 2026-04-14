import { describe, it, expect } from 'vitest';
import { matchesFilters, AUDIT_RETENTION_MS } from '../../src/services/audit.service';
import type { AuditEntry } from '../../src/types/db.types';

function entry(partial: Partial<AuditEntry>): AuditEntry {
  return {
    id: 'e',
    actor: 'alice',
    action: 'login',
    resourceType: 'user',
    resourceId: 'u1',
    detail: {},
    timestamp: 1000,
    ...partial
  };
}

describe('audit filter matching (pure)', () => {
  it('retention is 180 days', () => {
    expect(AUDIT_RETENTION_MS).toBe(180 * 24 * 60 * 60 * 1000);
  });

  it('passes when no filters given', () => {
    expect(matchesFilters(entry({}), {})).toBe(true);
  });

  it('filters by actor', () => {
    expect(matchesFilters(entry({ actor: 'alice' }), { actor: 'alice' })).toBe(true);
    expect(matchesFilters(entry({ actor: 'alice' }), { actor: 'bob' })).toBe(false);
  });

  it('filters by action and resourceType', () => {
    const e = entry({ action: 'lead_created', resourceType: 'lead' });
    expect(matchesFilters(e, { action: 'lead_created' })).toBe(true);
    expect(matchesFilters(e, { action: 'lead_updated' })).toBe(false);
    expect(matchesFilters(e, { resourceType: 'lead' })).toBe(true);
    expect(matchesFilters(e, { resourceType: 'plan' })).toBe(false);
  });

  it('filters by time window (from/to inclusive)', () => {
    const e = entry({ timestamp: 1000 });
    expect(matchesFilters(e, { from: 500, to: 1500 })).toBe(true);
    expect(matchesFilters(e, { from: 1001 })).toBe(false);
    expect(matchesFilters(e, { to: 999 })).toBe(false);
  });
});
