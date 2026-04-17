import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import LeadStatusBadge from '../../src/components/leads/LeadStatusBadge.svelte';
import type { LeadStatus } from '../../src/types/lead.types';

describe('<LeadStatusBadge>', () => {
  afterEach(cleanup);

  const expectations: Array<{
    status: LeadStatus;
    tone: string;
    label: string;
  }> = [
    { status: 'new', tone: 'info', label: 'New' },
    { status: 'in_discussion', tone: 'warning', label: 'In Discussion' },
    { status: 'quoted', tone: 'info', label: 'Quoted' },
    { status: 'confirmed', tone: 'success', label: 'Confirmed' },
    { status: 'closed', tone: 'neutral', label: 'Closed' }
  ];

  for (const { status, tone, label } of expectations) {
    it(`renders status=${status} as "${label}" with tone=${tone}`, () => {
      const { getByText } = render(LeadStatusBadge, { props: { status } });
      const el = getByText(label);
      expect(el.classList.contains(tone)).toBe(true);
      expect(el.classList.contains('badge')).toBe(true);
    });
  }
});
