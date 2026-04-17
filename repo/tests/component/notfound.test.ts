import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import NotFound from '../../src/routes/NotFound.svelte';
import { session, clearSession, setSession } from '../../src/stores/session.store';

describe('<NotFound>', () => {
  beforeEach(() => {
    window.location.hash = '';
    clearSession();
  });
  afterEach(() => {
    clearSession();
    cleanup();
    vi.restoreAllMocks();
    window.location.hash = '';
  });

  it('renders the page-not-found message', () => {
    const { getByText } = render(NotFound);
    expect(getByText('Page not found')).toBeInTheDocument();
  });

  it('Go home navigates to /login when no session', async () => {
    const { getByText } = render(NotFound);
    await fireEvent.click(getByText('Go home'));
    expect(window.location.hash).toBe('#/login');
  });

  it('Go home navigates to the role-default route for an authenticated user', async () => {
    setSession({ userId: 'u1', username: 'alice', role: 'planner' });
    const { getByText } = render(NotFound);
    await fireEvent.click(getByText('Go home'));
    expect(window.location.hash).toBe('#/plans');
  });

  it('Go home uses dispatcher default', async () => {
    setSession({ userId: 'u1', username: 'dave', role: 'dispatcher' });
    const { getByText } = render(NotFound);
    await fireEvent.click(getByText('Go home'));
    expect(window.location.hash).toBe('#/deliveries');
  });
});
