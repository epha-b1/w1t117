import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import BomEditor from '../../src/components/plans/BomEditor.svelte';
import { planService } from '../../src/services/plan.service';
import { setSession, clearSession } from '../../src/stores/session.store';
import type { BomItem } from '../../src/types/plan.types';

function item(overrides: Partial<BomItem> = {}): BomItem {
  return {
    id: overrides.id ?? 'b1',
    planId: 'p1',
    partNumber: overrides.partNumber ?? 'PN-1',
    description: overrides.description ?? 'Widget',
    quantity: overrides.quantity ?? 2,
    unit: overrides.unit ?? 'ea',
    unitCost: overrides.unitCost ?? 12.5,
    sortOrder: 0,
    ...overrides
  };
}

describe('<BomEditor>', () => {
  beforeEach(() => {
    clearSession();
    setSession({ userId: 'u1', username: 'a', role: 'planner' });
  });
  afterEach(() => {
    clearSession();
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders empty state when no items', () => {
    const { getByText } = render(BomEditor, {
      props: { planId: 'p1', items: [], onChange: () => {} }
    });
    expect(getByText('No BOM items')).toBeInTheDocument();
  });

  it('renders each item with formatted currency line total and grand total', () => {
    const items = [
      item({ id: 'a', partNumber: 'A', quantity: 2, unitCost: 10 }),
      item({ id: 'b', partNumber: 'B', quantity: 3, unitCost: 5 })
    ];
    const { container, getByText } = render(BomEditor, {
      props: { planId: 'p1', items, onChange: () => {} }
    });
    expect(getByText('A')).toBeInTheDocument();
    expect(getByText('B')).toBeInTheDocument();
    // Totals: 20.00 and 15.00 lines, plus grand total 35.00
    expect(container.textContent).toContain('$20.00');
    expect(container.textContent).toContain('$15.00');
    expect(container.textContent).toContain('Total: $35.00');
  });

  it('readOnly mode hides Add row and Remove buttons; shows formatted unit cost', () => {
    const items = [item({ partNumber: 'RO', unitCost: 9.99 })];
    const { container, queryByText, getByText } = render(BomEditor, {
      props: { planId: 'p1', items, readOnly: true, onChange: () => {} }
    });
    // No "Add" button anywhere in readOnly mode.
    expect(queryByText('Add')).toBeNull();
    // No "Remove" links.
    expect(container.querySelector('button.link')).toBeNull();
    // Unit cost rendered as currency (not an editable input).
    expect(getByText('$9.99')).toBeInTheDocument();
  });

  it('Add creates a new BOM item via planService and triggers onChange', async () => {
    const addSpy = vi.spyOn(planService, 'addBomItem').mockResolvedValue(undefined as never);
    const onChange = vi.fn().mockResolvedValue(undefined);

    const { container } = render(BomEditor, {
      props: { planId: 'p1', items: [], onChange }
    });

    // Fill the new-item inputs in the tfoot.
    const tfoot = container.querySelector('tfoot')!;
    const inputs = tfoot.querySelectorAll('input');
    const setInputValue = (el: Element, v: string) => {
      (el as HTMLInputElement).value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    setInputValue(inputs[0], 'PN-NEW');
    setInputValue(inputs[1], 'A new part');
    setInputValue(inputs[2], '5');      // qty
    setInputValue(inputs[3], 'ea');
    setInputValue(inputs[4], '10.50');  // unit cost
    setInputValue(inputs[5], '3.5');    // length

    const addBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === 'Add'
    )!;
    await fireEvent.click(addBtn);
    await Promise.resolve();

    expect(addSpy).toHaveBeenCalledTimes(1);
    const [planId, payload, actorId] = addSpy.mock.calls[0];
    expect(planId).toBe('p1');
    expect(payload).toMatchObject({
      partNumber: 'PN-NEW',
      description: 'A new part',
      quantity: 5,
      unit: 'ea',
      unitCost: 10.5,
      length: 3.5
    });
    expect(actorId).toBe('u1');
    expect(onChange).toHaveBeenCalled();
  });

  it('Add is a silent no-op when the part number is empty', async () => {
    const addSpy = vi.spyOn(planService, 'addBomItem').mockResolvedValue(undefined as never);
    const { container } = render(BomEditor, {
      props: { planId: 'p1', items: [], onChange: () => {} }
    });
    const addBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === 'Add'
    )!;
    await fireEvent.click(addBtn);
    await Promise.resolve();
    expect(addSpy).not.toHaveBeenCalled();
  });

  it('Remove calls planService.removeBomItem with the row id', async () => {
    const removeSpy = vi.spyOn(planService, 'removeBomItem').mockResolvedValue(undefined as never);
    const onChange = vi.fn().mockResolvedValue(undefined);
    const { getByText } = render(BomEditor, {
      props: { planId: 'p1', items: [item({ id: 'r1', partNumber: 'R1' })], onChange }
    });
    await fireEvent.click(getByText('Remove'));
    await Promise.resolve();
    expect(removeSpy).toHaveBeenCalledWith('r1', 'u1');
    expect(onChange).toHaveBeenCalled();
  });

  it('inline field edit dispatches planService.updateBomItem with coerced types', async () => {
    const updateSpy = vi
      .spyOn(planService, 'updateBomItem')
      .mockResolvedValue(undefined as never);
    const onChange = vi.fn().mockResolvedValue(undefined);
    const { container } = render(BomEditor, {
      props: { planId: 'p1', items: [item({ id: 'e1' })], onChange }
    });
    const row = container.querySelector('tbody tr')!;
    const inputs = row.querySelectorAll('input');
    // Change quantity (index 2).
    (inputs[2] as HTMLInputElement).value = '7';
    inputs[2].dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();

    expect(updateSpy).toHaveBeenCalledWith('e1', { quantity: 7 }, 'u1');
    expect(onChange).toHaveBeenCalled();
  });

  it('length field clears to undefined when input is emptied', async () => {
    const updateSpy = vi
      .spyOn(planService, 'updateBomItem')
      .mockResolvedValue(undefined as never);
    const { container } = render(BomEditor, {
      props: {
        planId: 'p1',
        items: [item({ id: 'e1', length: 4 })],
        onChange: () => {}
      }
    });
    const row = container.querySelector('tbody tr')!;
    const inputs = row.querySelectorAll('input');
    // Length is index 5.
    (inputs[5] as HTMLInputElement).value = '';
    inputs[5].dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();

    expect(updateSpy).toHaveBeenCalledWith('e1', { length: undefined }, 'u1');
  });
});
