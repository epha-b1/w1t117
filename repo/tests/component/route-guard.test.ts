import { describe, it, expect } from 'vitest';
import { canAccess, defaultRouteFor } from '../../src/guards/route-guard';

describe('RBAC route guard', () => {
  it('auditor can only access audit log and ledger', () => {
    expect(canAccess('audit', 'auditor')).toBe(true);
    expect(canAccess('ledger', 'auditor')).toBe(true);
    expect(canAccess('leads', 'auditor')).toBe(false);
    expect(canAccess('plans', 'auditor')).toBe(false);
    expect(canAccess('deliveries', 'auditor')).toBe(false);
    expect(canAccess('notifications', 'auditor')).toBe(false);
    expect(canAccess('admin_users', 'auditor')).toBe(false);
    expect(canAccess('backup', 'auditor')).toBe(false);
    expect(canAccess('jobs', 'auditor')).toBe(false);
  });

  it('admin has access to all areas', () => {
    const areas = ['leads', 'plans', 'deliveries', 'ledger', 'notifications',
      'audit', 'admin_users', 'backup', 'jobs'] as const;
    for (const a of areas) expect(canAccess(a, 'administrator')).toBe(true);
  });

  it('sales coordinator cannot reach user management or audit', () => {
    expect(canAccess('admin_users', 'sales_coordinator')).toBe(false);
    expect(canAccess('audit', 'sales_coordinator')).toBe(false);
    expect(canAccess('leads', 'sales_coordinator')).toBe(true);
  });

  it('defaultRouteFor picks a sensible landing per role', () => {
    expect(defaultRouteFor('auditor')).toBe('/audit');
    expect(defaultRouteFor('planner')).toBe('/plans');
    expect(defaultRouteFor('dispatcher')).toBe('/deliveries');
    expect(defaultRouteFor('sales_coordinator')).toBe('/leads');
    expect(defaultRouteFor('administrator')).toBe('/leads');
    expect(defaultRouteFor(null)).toBe('/login');
  });
});
