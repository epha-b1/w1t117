import { getAll, put } from './db';
import { uid } from '../utils/uid';
import type { DeliveryApiQueueEntry, DeliveryItem } from '../types/delivery.types';

export interface ScheduleDeliveryPayload {
  deliveryId: string;
  recipientName: string;
  recipientAddress: string;
  recipientZip: string;
  scheduledDate: string;
  scheduledSlot: string;
  items: DeliveryItem[];
}

export interface DeliveryApiResponse {
  success: boolean;
  externalId?: string;
  status?: string;
  message?: string;
}

export interface DeliveryApiAdapter {
  scheduleDelivery(payload: ScheduleDeliveryPayload): Promise<DeliveryApiResponse>;
  cancelDelivery(deliveryId: string): Promise<DeliveryApiResponse>;
  getStatus(deliveryId: string): Promise<DeliveryApiResponse>;
}

async function record(
  operation: DeliveryApiQueueEntry['operation'],
  payload: unknown,
  mockResponse: DeliveryApiResponse
): Promise<DeliveryApiQueueEntry> {
  const entry: DeliveryApiQueueEntry = {
    id: uid(),
    operation,
    payload,
    mockResponse,
    queuedAt: Date.now(),
    exportedAt: null
  };
  await put('delivery_api_queue', entry);
  return entry;
}

export class OfflineStubAdapter implements DeliveryApiAdapter {
  async scheduleDelivery(payload: ScheduleDeliveryPayload): Promise<DeliveryApiResponse> {
    const response: DeliveryApiResponse = {
      success: true,
      externalId: `STUB-${payload.deliveryId.slice(0, 8).toUpperCase()}`,
      status: 'scheduled',
      message: 'Offline stub response'
    };
    await record('scheduleDelivery', payload, response);
    return response;
  }

  async cancelDelivery(deliveryId: string): Promise<DeliveryApiResponse> {
    const response: DeliveryApiResponse = {
      success: true,
      externalId: `STUB-${deliveryId.slice(0, 8).toUpperCase()}`,
      status: 'cancelled',
      message: 'Offline stub response'
    };
    await record('cancelDelivery', { deliveryId }, response);
    return response;
  }

  async getStatus(deliveryId: string): Promise<DeliveryApiResponse> {
    const response: DeliveryApiResponse = {
      success: true,
      externalId: `STUB-${deliveryId.slice(0, 8).toUpperCase()}`,
      status: 'scheduled',
      message: 'Offline stub response'
    };
    await record('getStatus', { deliveryId }, response);
    return response;
  }
}

const adapter: DeliveryApiAdapter = new OfflineStubAdapter();

export function getAdapter(): DeliveryApiAdapter {
  return adapter;
}

export async function listQueue(): Promise<DeliveryApiQueueEntry[]> {
  const all = await getAll('delivery_api_queue');
  return all.sort((a, b) => b.queuedAt - a.queuedAt);
}

export async function exportQueue(): Promise<Blob> {
  const entries = await listQueue();
  const exportedAt = Date.now();
  for (const e of entries) {
    await put('delivery_api_queue', { ...e, exportedAt });
  }
  return new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' });
}

export const deliveryApiService = {
  getAdapter,
  listQueue,
  exportQueue
};
