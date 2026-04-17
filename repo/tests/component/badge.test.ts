import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import Badge from '../../src/components/common/Badge.svelte';

describe('<Badge>', () => {
  afterEach(cleanup);

  it('renders the label text', () => {
    const { getByText } = render(Badge, { props: { label: 'Hello' } });
    expect(getByText('Hello')).toBeInTheDocument();
  });

  it('applies the default "neutral" tone class when tone is omitted', () => {
    const { getByText } = render(Badge, { props: { label: 'N' } });
    const el = getByText('N');
    expect(el.classList.contains('badge')).toBe(true);
    expect(el.classList.contains('neutral')).toBe(true);
  });

  it.each(['info', 'success', 'warning', 'error'] as const)(
    'applies the "%s" tone class',
    (tone) => {
      const { getByText } = render(Badge, { props: { label: tone, tone } });
      const el = getByText(tone);
      expect(el.classList.contains(tone)).toBe(true);
      // Every rendered badge keeps the base class too.
      expect(el.classList.contains('badge')).toBe(true);
    }
  );
});
