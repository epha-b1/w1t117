import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import { get } from 'svelte/store';
import DeliveryDrawer from '../../src/components/deliveries/DeliveryDrawer.svelte';
import { deliveryService } from '../../src/services/delivery.service';
import { toasts } from '../../src/stores/toast.store';
import { setSession, clearSession } from '../../src/stores/session.store';
import type { Delivery } from '../../src/types/delivery.types';

function buildDelivery(overrides: Partial<Delivery> = {}): Delivery {
  const now = Date.now();
  return {
    id: 'del-12345678',
    leadId: null,
    planId: null,
    recipientName: 'Jane Doe',
    recipientAddress: '123 Main St',
    recipientZip: '10001',
    depotId: 'dep-1',
    scheduledDate: '2026-04-20',
    scheduledSlot: '10:00',
    status: 'scheduled',
    freightCost: 5000, // cents
    distanceMiles: 12.34,
    hasOversizeItem: false,
    items: [],
    assignedDriver: '',
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

describe('<DeliveryDrawer>', () => {
  beforeEach(() => {
    toasts.set([]);
    clearSession();
    vi.spyOn(deliveryService, 'listPods').mockResolvedValue([]);
    vi.spyOn(deliveryService, 'listExceptions').mockResolvedValue([]);
    vi.spyOn(deliveryService, 'getAvailableSlots').mockReturnValue(['09:00', '10:00', '11:00']);
  });
  afterEach(() => {
    toasts.set([]);
    clearSession();
    cleanup();
    vi.restoreAllMocks();
  });

  it('does not render the drawer dialog when open=false', () => {
    const { queryByRole } = render(DeliveryDrawer, {
      props: { open: false, delivery: buildDelivery() }
    });
    expect(queryByRole('dialog')).toBeNull();
  });

  it('renders delivery summary when open with a delivery', async () => {
    const { findByText, getByText } = render(DeliveryDrawer, {
      props: { open: true, delivery: buildDelivery() }
    });
    await findByText(/Delivery del-1234/);
    expect(getByText('Jane Doe')).toBeInTheDocument();
    expect(getByText(/ZIP 10001/)).toBeInTheDocument();
    expect(getByText('12.3 mi')).toBeInTheDocument();
    // Freight displayed with currency formatting, no oversize suffix.
    expect(getByText('$50.00')).toBeInTheDocument();
    // Driver shows em-dash when blank.
    expect(getByText('—')).toBeInTheDocument();
  });

  it('shows oversize surcharge text when hasOversizeItem=true', () => {
    const { getByText } = render(DeliveryDrawer, {
      props: { open: true, delivery: buildDelivery({ hasOversizeItem: true }) }
    });
    expect(getByText(/\(includes oversize surcharge\)/)).toBeInTheDocument();
  });

  it('Save slot calls deliveryService.scheduleDelivery and shows success toast', async () => {
    setSession({ userId: 'u1', username: 'a', role: 'administrator' });
    const spy = vi
      .spyOn(deliveryService, 'scheduleDelivery')
      .mockResolvedValue(undefined as never);
    const onChange = vi.fn();

    const { getByText } = render(DeliveryDrawer, {
      props: { open: true, delivery: buildDelivery(), onChange }
    });
    await fireEvent.click(getByText('Save slot'));
    await Promise.resolve();

    expect(spy).toHaveBeenCalledWith('del-12345678', '2026-04-20', '10:00', 'u1');
    expect(onChange).toHaveBeenCalled();
    expect(get(toasts).some((t) => t.level === 'success' && t.message === 'Delivery scheduled')).toBe(true);
  });

  it('Sync adapter status renders the returned adapter status block', async () => {
    setSession({ userId: 'u1', username: 'a', role: 'administrator' });
    vi.spyOn(deliveryService, 'fetchDeliveryStatus').mockResolvedValue({
      adapter: { status: 'scheduled', externalId: 'STUB-DEL12345', success: true }
    } as never);

    const { getByTestId, findByTestId } = render(DeliveryDrawer, {
      props: { open: true, delivery: buildDelivery() }
    });
    await fireEvent.click(getByTestId('sync-adapter-btn'));
    const status = await findByTestId('adapter-status');
    expect(status.textContent).toContain('scheduled');
    expect(status.textContent).toContain('STUB-DEL12345');
  });

  it('Cancel delivery is guarded by window.confirm — rejecting it does nothing', async () => {
    setSession({ userId: 'u1', username: 'a', role: 'administrator' });
    const confirmStub = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const spy = vi.spyOn(deliveryService, 'cancelDelivery').mockResolvedValue(undefined as never);

    const { getByText } = render(DeliveryDrawer, {
      props: { open: true, delivery: buildDelivery() }
    });
    await fireEvent.click(getByText('Cancel delivery'));
    expect(confirmStub).toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalled();
  });

  it('Cancel delivery confirmed calls service and pushes info toast', async () => {
    setSession({ userId: 'u1', username: 'a', role: 'administrator' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const spy = vi.spyOn(deliveryService, 'cancelDelivery').mockResolvedValue(undefined as never);
    const onChange = vi.fn();

    const { getByText } = render(DeliveryDrawer, {
      props: { open: true, delivery: buildDelivery(), onChange }
    });
    await fireEvent.click(getByText('Cancel delivery'));
    await Promise.resolve();

    expect(spy).toHaveBeenCalledWith('del-12345678', 'u1');
    expect(onChange).toHaveBeenCalled();
    expect(get(toasts).some((t) => t.level === 'info' && t.message === 'Delivery cancelled')).toBe(true);
  });

  it('POD capture button is disabled until signature is entered', async () => {
    const { container, findByText } = render(DeliveryDrawer, {
      props: { open: true, delivery: buildDelivery() }
    });
    await findByText('Proof of delivery');
    const podBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Capture POD'
    )! as HTMLButtonElement;
    expect(podBtn.disabled).toBe(true);

    const sigInput = container.querySelector('input[placeholder="Signature name"]') as HTMLInputElement;
    sigInput.value = 'Ada Lovelace';
    sigInput.dispatchEvent(new Event('input', { bubbles: true }));

    // Svelte re-evaluates reactive disabled.
    await Promise.resolve();
    expect(podBtn.disabled).toBe(false);
  });

  it('POD capture invokes service and refreshes POD list', async () => {
    setSession({ userId: 'u1', username: 'a', role: 'administrator' });
    const captureSpy = vi
      .spyOn(deliveryService, 'capturePod')
      .mockResolvedValue(undefined as never);
    // First call returns empty, second call returns one POD after capture.
    const listSpy = vi
      .spyOn(deliveryService, 'listPods')
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'pod1',
          deliveryId: 'del-12345678',
          signatureName: 'Ada',
          timestamp: Date.now(),
          createdAt: Date.now()
        }
      ]);

    const { container, findByText } = render(DeliveryDrawer, {
      props: { open: true, delivery: buildDelivery() }
    });
    await findByText('Proof of delivery');

    const sigInput = container.querySelector('input[placeholder="Signature name"]') as HTMLInputElement;
    sigInput.value = 'Ada';
    sigInput.dispatchEvent(new Event('input', { bubbles: true }));
    await Promise.resolve();

    const podBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Capture POD'
    )!;
    await fireEvent.click(podBtn);
    await new Promise((r) => setTimeout(r, 10));

    expect(captureSpy).toHaveBeenCalled();
    expect(listSpy).toHaveBeenCalledTimes(2); // initial + post-capture refresh
    expect(get(toasts).some((t) => t.level === 'success' && t.message === 'POD captured')).toBe(true);
  });

  it('Log exception button is disabled until a reason is entered', async () => {
    const { container, findByText } = render(DeliveryDrawer, {
      props: { open: true, delivery: buildDelivery() }
    });
    await findByText('Exception');
    const logBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Log'
    )! as HTMLButtonElement;
    expect(logBtn.disabled).toBe(true);
  });

  it('schedule error surfaces through the toast store', async () => {
    setSession({ userId: 'u1', username: 'a', role: 'administrator' });
    vi.spyOn(deliveryService, 'scheduleDelivery').mockRejectedValue(new Error('slot taken'));

    const { getByText } = render(DeliveryDrawer, {
      props: { open: true, delivery: buildDelivery() }
    });
    await fireEvent.click(getByText('Save slot'));
    await new Promise((r) => setTimeout(r, 5));

    expect(get(toasts).some((t) => t.level === 'error' && t.message === 'slot taken')).toBe(true);
  });
});
