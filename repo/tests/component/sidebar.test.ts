import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import Sidebar from '../../src/components/layout/Sidebar.svelte';
import { setSession, clearSession } from '../../src/stores/session.store';

const ALL_LABELS = [
  'Lead Inbox',
  'Plan Workspace',
  'Delivery Calendar',
  'Ledger',
  'Notifications',
  'Audit Log',
  'Jobs',
  'Users',
  'Backup'
];

describe('<Sidebar>', () => {
  beforeEach(() => {
    clearSession();
    window.location.hash = '';
  });
  afterEach(() => {
    clearSession();
    cleanup();
    window.location.hash = '';
  });

  it('renders no navigation links when no session (role null → canAccess false)', () => {
    const { container } = render(Sidebar);
    expect(container.querySelectorAll('nav ul li')).toHaveLength(0);
  });

  it('administrator sees every navigation item', () => {
    setSession({ userId: 'u1', username: 'admin', role: 'administrator' });
    const { getByText } = render(Sidebar);
    for (const label of ALL_LABELS) {
      expect(getByText(label)).toBeInTheDocument();
    }
  });

  it('auditor sees only Ledger and Audit Log', () => {
    setSession({ userId: 'u2', username: 'aud', role: 'auditor' });
    const { getByText, queryByText } = render(Sidebar);
    expect(getByText('Ledger')).toBeInTheDocument();
    expect(getByText('Audit Log')).toBeInTheDocument();
    // Everything else denied for auditors.
    expect(queryByText('Lead Inbox')).toBeNull();
    expect(queryByText('Plan Workspace')).toBeNull();
    expect(queryByText('Delivery Calendar')).toBeNull();
    expect(queryByText('Notifications')).toBeNull();
    expect(queryByText('Jobs')).toBeNull();
    expect(queryByText('Users')).toBeNull();
    expect(queryByText('Backup')).toBeNull();
  });

  it('sales_coordinator cannot reach Users, Backup, Audit, or Jobs', () => {
    setSession({ userId: 'u3', username: 'sc', role: 'sales_coordinator' });
    const { queryByText, getByText } = render(Sidebar);
    expect(getByText('Lead Inbox')).toBeInTheDocument();
    expect(getByText('Plan Workspace')).toBeInTheDocument();
    expect(queryByText('Users')).toBeNull();
    expect(queryByText('Backup')).toBeNull();
    expect(queryByText('Audit Log')).toBeNull();
    expect(queryByText('Jobs')).toBeNull();
  });

  it('planner cannot reach Users, Backup, or Audit Log', () => {
    setSession({ userId: 'u4', username: 'pl', role: 'planner' });
    const { queryByText, getByText } = render(Sidebar);
    expect(getByText('Plan Workspace')).toBeInTheDocument();
    expect(getByText('Jobs')).toBeInTheDocument();
    expect(queryByText('Users')).toBeNull();
    expect(queryByText('Backup')).toBeNull();
    expect(queryByText('Audit Log')).toBeNull();
  });

  it('dispatcher sees Delivery, Jobs, Notifications, Ledger, Leads, Plans', () => {
    setSession({ userId: 'u5', username: 'di', role: 'dispatcher' });
    const { getByText, queryByText } = render(Sidebar);
    expect(getByText('Delivery Calendar')).toBeInTheDocument();
    expect(getByText('Jobs')).toBeInTheDocument();
    expect(getByText('Notifications')).toBeInTheDocument();
    expect(getByText('Ledger')).toBeInTheDocument();
    expect(queryByText('Users')).toBeNull();
    expect(queryByText('Backup')).toBeNull();
    expect(queryByText('Audit Log')).toBeNull();
  });

  it('click on a nav link calls navigate() and updates the hash', async () => {
    setSession({ userId: 'u1', username: 'admin', role: 'administrator' });
    const { getByText } = render(Sidebar);
    await fireEvent.click(getByText('Delivery Calendar'));
    expect(window.location.hash).toBe('#/deliveries');
  });

  it('active class is applied to the current path', () => {
    window.location.hash = '#/leads';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    setSession({ userId: 'u1', username: 'admin', role: 'administrator' });
    const { getByText } = render(Sidebar);
    expect(getByText('Lead Inbox').classList.contains('active')).toBe(true);
    expect(getByText('Plan Workspace').classList.contains('active')).toBe(false);
  });

  it('active class also applies when current path is a child of the nav item', () => {
    window.location.hash = '#/admin/users';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    setSession({ userId: 'u1', username: 'admin', role: 'administrator' });
    const { getByText } = render(Sidebar);
    expect(getByText('Users').classList.contains('active')).toBe(true);
  });
});
