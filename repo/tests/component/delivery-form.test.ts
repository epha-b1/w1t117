import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import DeliveryForm from '../../src/components/deliveries/DeliveryForm.svelte';
import * as deliveryApi from '../../src/services/delivery.service';

const TEST_DEPOTS = [
  { id: 'dep-1', name: 'Main Depot', address: 'X', lat: 40, lon: -74, zip: '10001' },
  { id: 'dep-2', name: 'North Depot', address: 'Y', lat: 41, lon: -73, zip: '10025' }
];

function setRequiredFields(container: HTMLElement) {
  const inputs = container.querySelectorAll('label input, label select');
  const byLabel = (label: string): HTMLInputElement | HTMLSelectElement => {
    const lab = Array.from(container.querySelectorAll('label')).find((l) =>
      l.textContent?.trim().startsWith(label)
    );
    if (!lab) throw new Error('label missing: ' + label);
    return lab.querySelector('input, select') as HTMLInputElement | HTMLSelectElement;
  };
  void inputs;
  const set = (label: string, val: string) => {
    const el = byLabel(label);
    (el as HTMLInputElement).value = val;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  set('Recipient name', 'Jane Doe');
  set('Address', '123 Main St');
  set('ZIP', '10001');
}

describe('<DeliveryForm>', () => {
  beforeEach(() => {
    vi.spyOn(deliveryApi.deliveryService, 'listDepots').mockResolvedValue(
      TEST_DEPOTS as never
    );
  });
  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  it('loads depots on mount and pre-selects the first one', async () => {
    const { findByText, container } = render(DeliveryForm, {
      props: { onSubmit: vi.fn() }
    });
    await findByText('Main Depot');
    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select.value).toBe('dep-1');
  });

  it('adds and removes item rows', async () => {
    const { container, getByText } = render(DeliveryForm, {
      props: { onSubmit: vi.fn() }
    });
    // Initial row count = 1
    expect(container.querySelectorAll('.item-row').length).toBe(1);
    await fireEvent.click(getByText('+ Add item'));
    expect(container.querySelectorAll('.item-row').length).toBe(2);
    // Remove the first item.
    const removeButtons = container.querySelectorAll('.item-row button');
    await fireEvent.click(removeButtons[0] as HTMLButtonElement);
    expect(container.querySelectorAll('.item-row').length).toBe(1);
  });

  it('shows "All recipient fields are required" on empty submit', async () => {
    const onSubmit = vi.fn();
    const { container, findByText, getByText } = render(DeliveryForm, {
      props: { onSubmit }
    });
    await findByText('Main Depot');
    await fireEvent.submit(container.querySelector('form')!);
    expect(getByText('All recipient fields are required')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows "Each item needs description and quantity" when an item is incomplete', async () => {
    const onSubmit = vi.fn();
    const { container, findByText, getByText } = render(DeliveryForm, {
      props: { onSubmit }
    });
    await findByText('Main Depot');
    setRequiredFields(container);
    // The default item row has empty description → validation should trigger.
    await fireEvent.submit(container.querySelector('form')!);
    expect(getByText('Each item needs description and quantity')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits a normalised payload when valid', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { container, findByText } = render(DeliveryForm, { props: { onSubmit } });
    await findByText('Main Depot');
    setRequiredFields(container);
    // Fill the item description + quantity.
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
    // Optional driver left blank → undefined (not empty string)
    expect(payload.assignedDriver).toBeUndefined();
  });

  it('surfaces onSubmit errors in the error div', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('service down'));
    const { container, findByText } = render(DeliveryForm, { props: { onSubmit } });
    await findByText('Main Depot');
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
    const { findByText, getByText } = render(DeliveryForm, {
      props: { onSubmit: vi.fn(), onCancel }
    });
    await findByText('Main Depot');
    await fireEvent.click(getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
