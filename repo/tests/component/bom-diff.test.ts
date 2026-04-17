import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import BomDiff from '../../src/components/plans/BomDiff.svelte';
import type { BomItem, BomDiff as BomDiffType } from '../../src/types/plan.types';

function item(overrides: Partial<BomItem> = {}): BomItem {
  return {
    id: overrides.id ?? 'i1',
    planId: 'p1',
    partNumber: overrides.partNumber ?? 'PN-1',
    description: overrides.description ?? 'Widget',
    quantity: overrides.quantity ?? 1,
    unit: 'ea',
    unitCost: overrides.unitCost ?? 12.5,
    sortOrder: 0,
    ...overrides
  };
}

describe('<BomDiff>', () => {
  afterEach(cleanup);

  it('renders three sections with counts (all empty)', () => {
    const diff: BomDiffType = { added: [], removed: [], modified: [] };
    const { getByText, getAllByText } = render(BomDiff, { props: { diff } });
    expect(getByText('Added (0)')).toBeInTheDocument();
    expect(getByText('Removed (0)')).toBeInTheDocument();
    expect(getByText('Modified (0)')).toBeInTheDocument();
    // Three empty placeholders, one per section.
    expect(getAllByText('None').length).toBe(3);
  });

  it('renders added items with formatted currency', () => {
    const diff: BomDiffType = {
      added: [item({ partNumber: 'NEW-1', description: 'Spring', quantity: 3, unitCost: 9.99 })],
      removed: [],
      modified: []
    };
    const { getByText, container } = render(BomDiff, { props: { diff } });
    expect(getByText('Added (1)')).toBeInTheDocument();
    const row = container.querySelector('.row.added');
    expect(row).not.toBeNull();
    expect(row!.textContent).toContain('NEW-1');
    expect(row!.textContent).toContain('Spring');
    expect(row!.textContent).toContain('qty 3');
    expect(row!.textContent).toContain('$9.99');
  });

  it('renders removed items with partNumber and description', () => {
    const diff: BomDiffType = {
      added: [],
      removed: [item({ partNumber: 'OLD-1', description: 'Legacy bolt' })],
      modified: []
    };
    const { container, getByText } = render(BomDiff, { props: { diff } });
    expect(getByText('Removed (1)')).toBeInTheDocument();
    const row = container.querySelector('.row.removed');
    expect(row).not.toBeNull();
    expect(row!.textContent).toContain('OLD-1');
    expect(row!.textContent).toContain('Legacy bolt');
  });

  it('renders modified items with before / after for each changed field', () => {
    const before = item({ partNumber: 'MOD-1', description: 'old-desc', quantity: 2, unitCost: 1 });
    const after = item({ partNumber: 'MOD-1', description: 'new-desc', quantity: 5, unitCost: 1 });
    const diff: BomDiffType = {
      added: [],
      removed: [],
      modified: [{ before, after, changedFields: ['description', 'quantity'] }]
    };
    const { container, getByText } = render(BomDiff, { props: { diff } });
    expect(getByText('Modified (1)')).toBeInTheDocument();
    const row = container.querySelector('.row.modified');
    expect(row).not.toBeNull();
    // Both before + after values render for each changed field.
    expect(row!.textContent).toContain('old-desc');
    expect(row!.textContent).toContain('new-desc');
    expect(row!.textContent).toContain('2');
    expect(row!.textContent).toContain('5');
    // Change rows for each field (2 of them)
    expect(row!.querySelectorAll('.change').length).toBe(2);
  });

  it('handles null/undefined field values in before/after gracefully (no "null" text)', () => {
    const before = item({ partNumber: 'MOD-2', length: undefined });
    const after = item({ partNumber: 'MOD-2', length: 8 });
    const diff: BomDiffType = {
      added: [],
      removed: [],
      modified: [{ before, after, changedFields: ['length'] }]
    };
    const { container } = render(BomDiff, { props: { diff } });
    const change = container.querySelector('.row.modified .change');
    expect(change).not.toBeNull();
    expect(change!.textContent).toContain('length:');
    expect(change!.textContent).not.toContain('null');
    expect(change!.textContent).not.toContain('undefined');
    expect(change!.textContent).toContain('8');
  });

  it('handles multiple items per section', () => {
    const diff: BomDiffType = {
      added: [item({ id: 'a1', partNumber: 'A1' }), item({ id: 'a2', partNumber: 'A2' })],
      removed: [item({ id: 'r1', partNumber: 'R1' })],
      modified: []
    };
    const { container, getByText } = render(BomDiff, { props: { diff } });
    expect(getByText('Added (2)')).toBeInTheDocument();
    expect(container.querySelectorAll('.row.added').length).toBe(2);
    expect(container.querySelectorAll('.row.removed').length).toBe(1);
  });
});
