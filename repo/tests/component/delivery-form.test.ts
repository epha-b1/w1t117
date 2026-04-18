import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import DeliveryForm from '../../src/components/deliveries/DeliveryForm.svelte';
import { clearAll, put } from '../../src/services/db';

const TEST_DEPOTS = [
  { id: 'dep-1', name: 'Main Depot', lat: 40, lng: -74, zipRanges: ['10001'] },
  { id: 'dep-2', name: 'North Depot', lat: 41, lng: -73, zipRanges: ['10025'] }
];

async function freshDb() {
  // Use clearAll rather than deleteDatabase to avoid a close/delete race in
  // fake-indexeddb: closing a connection is not strictly synchronous, so a
  // follow-up deleteDatabase can fire `onblocked` and we continue without
  // the DB actually being gone. Clearing each store is more reliable here.
  await clearAll();
  for (const d of TEST_DEPOTS) await put('depots', d as never);
}

function setRequiredFields(container: HTMLElement) {
  const byLabel = (label: string): HTMLInputElement => {
    const lab = Array.from(container.querySelectorAll('label')).find((l) =>
      l.textContent?.trim().startsWith(label)
    );
    if (!lab) throw new Error('label missing: ' + label);
    return lab.querySelector('input, select') as HTMLInputElement;
  };
  const set = (label: string, val: string) => {
    const el = byLabel(label);
    el.value = val;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  set('Recipient name', 'Jane Doe');
  set('Address', '123 Main St');
  set('ZIP', '10001');
}

async function waitForDepotsLoaded(container: HTMLElement) {
  for (let i = 0; i < 300; i++) {
    const options = container.querySelectorAll('select option');
    if (options.length > 0) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('depots never loaded');
}

describe('<DeliveryForm>', () => {
  beforeEach(async () => {
    await freshDb();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it('loads depots on mount and pre-selects the first one', async () => {
    const { container } = render(DeliveryForm, { props: { onSubmit: vi.fn() } });
    await waitForDepotsLoaded(container);
    const options = container.querySelectorAll('select option');
    expect(options.length).toBeGreaterThanOrEqual(1);
    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select.value).toBe('dep-1');
  });

  it('adds and removes item rows', async () => {
    const { container, getByText } = render(DeliveryForm, { props: { onSubmit: vi.fn() } });
    expect(container.querySelectorAll('.item-row').length).toBe(1);
    await fireEvent.click(getByText('+ Add item'));
    expect(container.querySelectorAll('.item-row').length).toBe(2);
    const removeButtons = container.querySelectorAll('.item-row button');
    await fireEvent.click(removeButtons[0] as HTMLButtonElement);
    expect(container.querySelectorAll('.item-row').length).toBe(1);
  });

  it('shows "All recipient fields are required" on empty submit', async () => {
    const onSubmit = vi.fn();
    const { container, findByText } = render(DeliveryForm, { props: { onSubmit } });
    await waitForDepotsLoaded(container);
    await fireEvent.submit(container.querySelector('form')!);
    await findByText('All recipient fields are required');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows "Each item needs description and quantity" when an item is incomplete', async () => {
    const onSubmit = vi.fn();
    const { container, findByText } = render(DeliveryForm, { props: { onSubmit } });
    await waitForDepotsLoaded(container);
    setRequiredFields(container);
    await fireEvent.submit(container.querySelector('form')!);
    await findByText('Each item needs description and quantity');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits a normalised payload when valid', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { container } = render(DeliveryForm, { props: { onSubmit } });
    await waitForDepotsLoaded(container);
    setRequiredFields(container);
    const itemRow = container.querySelector('.item-row')!;
    const [desc, qty] = itemRow.querySelectorAll('input');
    (desc as HTMLInputElement).value = 'Box A';
    desc.dispatchEvent(new Event('input', { bubbles: true }));
    (qty as HTMLInputElement).value = '2';
    qty.dispatchEvent(new Event('input', { bubbles: true }));

    await fireEvent.submit(container.querySelector('form')!);
    await Promise.resolve();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.recipientName).toBe('Jane Doe');
    expect(payload.recipientAddress).toBe('123 Main St');
    expect(payload.recipientZip).toBe('10001');
    expect(payload.depotId).toBe('dep-1');
    expect(payload.items).toHaveLength(1);
    expect(payload.items[0].description).toBe('Box A');
    expect(payload.items[0].quantity).toBe(2);
    expect(payload.assignedDriver).toBeUndefined();
  });

  it('surfaces onSubmit errors in the error div', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('service down'));
    const { container, findByText } = render(DeliveryForm, { props: { onSubmit } });
    await waitForDepotsLoaded(container);
    setRequiredFields(container);
    const itemRow = container.querySelector('.item-row')!;
    const [desc] = itemRow.querySelectorAll('input');
    (desc as HTMLInputElement).value = 'Box';
    desc.dispatchEvent(new Event('input', { bubbles: true }));
    await fireEvent.submit(container.querySelector('form')!);
    await findByText('service down');
  });

  it('Cancel invokes onCancel', async () => {
    const onCancel = vi.fn();
    const { getByText } = render(DeliveryForm, {
      props: { onSubmit: vi.fn(), onCancel }
    });
    await fireEvent.click(getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
