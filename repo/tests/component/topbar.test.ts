import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import Topbar from '../../src/components/layout/Topbar.svelte';
import { setSession, clearSession } from '../../src/stores/session.store';
import * as authService from '../../src/services/auth.service';

describe('<Topbar>', () => {
  beforeEach(() => {
    clearSession();
    window.location.hash = '';
  });
  afterEach(() => {
    clearSession();
    cleanup();
    vi.restoreAllMocks();
    window.location.hash = '';
  });

  it('renders an empty user block when no session', () => {
    const { container, queryByText } = render(Topbar);
    expect(container.querySelector('.topbar')).not.toBeNull();
    expect(queryByText('Log out')).toBeNull();
  });

  it('shows username, humanised role, and a log-out button when signed in', () => {
    setSession({ userId: 'u1', username: 'admin', role: 'sales_coordinator' });
    const { getByText } = render(Topbar);
    expect(getByText('admin')).toBeInTheDocument();
    // role: underscores replaced with spaces (e.g. "sales_coordinator" → "sales coordinator")
    expect(getByText('sales coordinator')).toBeInTheDocument();
    expect(getByText('Log out')).toBeInTheDocument();
  });

  it('Log out invokes authService.logout() and navigates to /login', async () => {
    setSession({ userId: 'u1', username: 'admin', role: 'administrator' });
    const logoutSpy = vi
      .spyOn(authService.authService, 'logout')
      .mockResolvedValue(undefined as unknown as void);

    const { getByText } = render(Topbar);
    await fireEvent.click(getByText('Log out'));

    // Allow the async handler's microtasks to settle.
    await Promise.resolve();

    expect(logoutSpy).toHaveBeenCalled();
    expect(window.location.hash).toBe('#/login');
  });
});
