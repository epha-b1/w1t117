import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import Toast from '../../src/components/common/Toast.svelte';
import { toasts, pushToast } from '../../src/stores/toast.store';

describe('<Toast> container', () => {
  beforeEach(() => {
    toasts.set([]);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    toasts.set([]);
    cleanup();
  });

  it('renders nothing when the store is empty', () => {
    const { container } = render(Toast);
    // aria-live wrapper exists but no .toast entries.
    expect(container.querySelectorAll('.toast')).toHaveLength(0);
  });

  it('reactively renders entries pushed to the store', async () => {
    const { container, findByText } = render(Toast);
    pushToast('created', 'success', 0);
    await findByText('created');
    const entries = container.querySelectorAll('.toast');
    expect(entries).toHaveLength(1);
    expect(entries[0].classList.contains('success')).toBe(true);
  });

  it('applies the level class per entry', async () => {
    const { container, findByText } = render(Toast);
    pushToast('err', 'error', 0);
    await findByText('err');
    expect(container.querySelector('.toast.error')).not.toBeNull();
  });

  it('Dismiss button removes the specific entry from the store', async () => {
    const { container, findByText, queryByText } = render(Toast);
    pushToast('a', 'info', 0);
    pushToast('b', 'info', 0);
    await findByText('a');
    await findByText('b');
    expect(container.querySelectorAll('.toast')).toHaveLength(2);

    const dismissButtons = container.querySelectorAll('button[aria-label="Dismiss"]');
    await fireEvent.click(dismissButtons[0] as HTMLButtonElement);

    // 'a' should be gone, 'b' should remain.
    expect(queryByText('a')).toBeNull();
    expect(queryByText('b')).not.toBeNull();
  });

  it('aria-live region is polite for non-blocking announcements', () => {
    const { container } = render(Toast);
    const wrap = container.querySelector('.toast-wrap');
    expect(wrap?.getAttribute('aria-live')).toBe('polite');
  });
});
