import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { toasts, pushToast, dismissToast } from '../../src/stores/toast.store';

describe('toast store', () => {
  beforeEach(() => {
    toasts.set([]);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    toasts.set([]);
  });

  it('pushToast appends a new entry with an id', () => {
    const id = pushToast('hello');
    const list = get(toasts);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(id);
    expect(list[0].message).toBe('hello');
    expect(list[0].level).toBe('info'); // default
    expect(list[0].timeout).toBe(4000); // default
  });

  it('pushToast respects explicit level and timeout', () => {
    pushToast('oops', 'error', 1000);
    const [t] = get(toasts);
    expect(t.level).toBe('error');
    expect(t.timeout).toBe(1000);
  });

  it('appending preserves existing entries in order', () => {
    pushToast('one');
    pushToast('two');
    pushToast('three');
    expect(get(toasts).map((t) => t.message)).toEqual(['one', 'two', 'three']);
  });

  it('pushToast schedules auto-dismiss after timeout', () => {
    pushToast('auto', 'success', 500);
    expect(get(toasts)).toHaveLength(1);
    vi.advanceTimersByTime(499);
    expect(get(toasts)).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(get(toasts)).toHaveLength(0);
  });

  it('pushToast with timeout=0 never auto-dismisses', () => {
    pushToast('sticky', 'warning', 0);
    expect(get(toasts)).toHaveLength(1);
    vi.advanceTimersByTime(100_000);
    expect(get(toasts)).toHaveLength(1);
  });

  it('dismissToast removes the specified entry and leaves the rest', () => {
    const a = pushToast('a');
    const b = pushToast('b');
    dismissToast(a);
    const remaining = get(toasts);
    expect(remaining.map((t) => t.id)).toEqual([b]);
  });

  it('dismissToast on an unknown id is a no-op', () => {
    pushToast('x');
    dismissToast('does-not-exist');
    expect(get(toasts)).toHaveLength(1);
  });

  it('each pushToast produces a unique id', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 10; i++) ids.add(pushToast('m' + i));
    expect(ids.size).toBe(10);
  });
});
