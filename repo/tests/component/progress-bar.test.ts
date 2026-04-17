import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import ProgressBar from '../../src/components/common/ProgressBar.svelte';

function fill(container: HTMLElement): HTMLElement {
  const el = container.querySelector('.fill');
  if (!el) throw new Error('progress fill missing');
  return el as HTMLElement;
}

describe('<ProgressBar>', () => {
  afterEach(cleanup);

  it('renders with role=progressbar and default ARIA attrs', () => {
    const { getByRole } = render(ProgressBar);
    const bar = getByRole('progressbar');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
    expect(bar.getAttribute('aria-valuenow')).toBe('0');
  });

  it('sets width proportional to value / max', () => {
    const { container } = render(ProgressBar, { props: { value: 25 } });
    expect(fill(container).style.width).toBe('25%');
  });

  it('clamps values above 100% to 100%', () => {
    const { container } = render(ProgressBar, { props: { value: 250 } });
    expect(fill(container).style.width).toBe('100%');
  });

  it('clamps negative values to 0%', () => {
    const { container } = render(ProgressBar, { props: { value: -30 } });
    expect(fill(container).style.width).toBe('0%');
  });

  it('scales against a custom max', () => {
    const { container, getByRole } = render(ProgressBar, {
      props: { value: 5, max: 10 }
    });
    expect(fill(container).style.width).toBe('50%');
    expect(getByRole('progressbar').getAttribute('aria-valuemax')).toBe('10');
    expect(getByRole('progressbar').getAttribute('aria-valuenow')).toBe('5');
  });
});
