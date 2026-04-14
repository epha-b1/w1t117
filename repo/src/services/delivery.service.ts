import { get, getAll, getAllByIndex, put } from './db';
import { uid } from '../utils/uid';
import { sanitizeText } from '../utils/validation';
import { calculateFreight } from '../utils/freight';
import { haversineDistance, zipInRange, zipToCoords } from '../utils/distance';
import type {
  CoverageResult,
  Delivery,
  DeliveryException,
  DeliveryFilters,
  DeliveryItem,
  DeliveryPod,
  Depot,
  ExceptionType,
  FreightResult
} from '../types/delivery.types';
import * as audit from './audit.service';
import * as notif from './notification.service';
import { authorize } from './authz.service';
import { getAdapter as getDeliveryApiAdapter } from './delivery-api.service';

const MAX_MILES = 120;
const SLOT_START = 8 * 60;
const SLOT_END = 18 * 60;
const SLOT_STEP = 30;

export function getAvailableSlots(): string[] {
  const slots: string[] = [];
  for (let m = SLOT_START; m < SLOT_END; m += SLOT_STEP) {
    const hh = Math.floor(m / 60).toString().padStart(2, '0');
    const mm = (m % 60).toString().padStart(2, '0');
    slots.push(`${hh}:${mm}`);
  }
  return slots;
}

function isValidSlot(slot: string): boolean {
  return getAvailableSlots().includes(slot);
}

function isValidDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

export async function seedDefaultDepot(): Promise<void> {
  const depots = await getAll('depots');
  if (depots.length > 0) return;
  const depot: Depot = {
    id: 'depot-default',
    name: 'Main Depot',
    lat: 40.7128,
    lng: -74.0060,
    zipRanges: ['10001-10299', '07001-07099']
  };
  await put('depots', depot);
}

export async function listDepots(): Promise<Depot[]> {
  return await getAll('depots');
}

export async function addDepot(
  depot: Omit<Depot, 'id'>,
  actorId: string = 'system'
): Promise<Depot> {
  await authorize(actorId, 'delivery:create');
  const record: Depot = { ...depot, id: uid() };
  await put('depots', record);
  return record;
}

export async function checkCoverage(
  recipientZip: string,
  depotId: string
): Promise<CoverageResult> {
  const depot = await get('depots', depotId);
  if (!depot) return { covered: false, distanceMiles: 0, reason: 'Depot not found' };
  const zip = recipientZip.trim();
  const inRange = depot.zipRanges.some((r) => zipInRange(zip, r));
  if (!inRange) {
    return { covered: false, distanceMiles: 0, reason: 'ZIP not in depot coverage range' };
  }
  const coords = zipToCoords(zip);
  if (!coords) {
    return { covered: false, distanceMiles: 0, reason: 'ZIP not in lookup table' };
  }
  const distance = haversineDistance(depot.lat, depot.lng, coords.lat, coords.lng);
  if (distance > MAX_MILES) {
    return {
      covered: false,
      distanceMiles: distance,
      reason: `Exceeds maximum distance (${distance.toFixed(1)} mi > ${MAX_MILES} mi)`
    };
  }
  return { covered: true, distanceMiles: distance };
}

export function calcFreight(distanceMiles: number, items: DeliveryItem[]): FreightResult {
  return calculateFreight(distanceMiles, items);
}

interface CreateDeliveryInput {
  leadId?: string;
  planId?: string;
  recipientName: string;
  recipientAddress: string;
  recipientZip: string;
  depotId: string;
  items: DeliveryItem[];
  assignedDriver?: string;
}

export async function createDelivery(
  input: CreateDeliveryInput,
  actorId: string
): Promise<Delivery> {
  await authorize(actorId, 'delivery:create');
  const zip = sanitizeText(input.recipientZip);
  const coverage = await checkCoverage(zip, input.depotId);
  if (!coverage.covered) throw new Error(coverage.reason ?? 'Out of coverage');
  const freight = calcFreight(coverage.distanceMiles, input.items);
  const now = Date.now();
  const delivery: Delivery = {
    id: uid(),
    leadId: input.leadId ?? null,
    planId: input.planId ?? null,
    recipientName: sanitizeText(input.recipientName),
    recipientAddress: sanitizeText(input.recipientAddress),
    recipientZip: zip,
    depotId: input.depotId,
    scheduledDate: '',
    scheduledSlot: '',
    status: 'scheduled',
    freightCost: freight.totalCost,
    distanceMiles: coverage.distanceMiles,
    hasOversizeItem: freight.hasOversizeItem,
    items: input.items.map((i) => ({ ...i, id: i.id || uid() })),
    assignedDriver: sanitizeText(input.assignedDriver ?? ''),
    createdAt: now,
    updatedAt: now
  };
  await put('deliveries', delivery);
  await audit.log({
    actor: actorId,
    action: 'delivery_created',
    resourceType: 'delivery',
    resourceId: delivery.id,
    detail: {
      distanceMiles: coverage.distanceMiles,
      freightCost: freight.totalCost,
      hasOversize: freight.hasOversizeItem
    }
  });
  return delivery;
}

export async function scheduleDelivery(
  deliveryId: string,
  date: string,
  slot: string,
  actorId: string
): Promise<Delivery> {
  await authorize(actorId, 'delivery:schedule');
  if (!isValidDate(date)) throw new Error('Invalid date format (expected YYYY-MM-DD)');
  if (!isValidSlot(slot)) throw new Error('Invalid slot');
  const delivery = await get('deliveries', deliveryId);
  if (!delivery) throw new Error('Delivery not found');
  const updated: Delivery = {
    ...delivery,
    scheduledDate: date,
    scheduledSlot: slot,
    status: 'scheduled',
    updatedAt: Date.now()
  };
  await put('deliveries', updated);
  await audit.log({
    actor: actorId,
    action: 'delivery_scheduled',
    resourceType: 'delivery',
    resourceId: deliveryId,
    detail: { date, slot }
  });
  try {
    await getDeliveryApiAdapter().scheduleDelivery({
      deliveryId,
      recipientName: updated.recipientName,
      recipientAddress: updated.recipientAddress,
      recipientZip: updated.recipientZip,
      scheduledDate: date,
      scheduledSlot: slot,
      items: updated.items
    });
  } catch {
    /* offline adapter never throws; guard is defensive */
  }
  await notif.dispatch('delivery_scheduled', actorId, {
    deliveryId,
    date,
    slot
  });
  return updated;
}

export async function cancelDelivery(
  deliveryId: string,
  actorId: string,
  reason = ''
): Promise<Delivery> {
  await authorize(actorId, 'delivery:cancel');
  const delivery = await get('deliveries', deliveryId);
  if (!delivery) throw new Error('Delivery not found');
  const updated: Delivery = {
    ...delivery,
    status: 'cancelled',
    updatedAt: Date.now()
  };
  await put('deliveries', updated);
  await audit.log({
    actor: actorId,
    action: 'delivery_cancelled',
    resourceType: 'delivery',
    resourceId: deliveryId,
    detail: { reason }
  });
  try {
    await getDeliveryApiAdapter().cancelDelivery(deliveryId);
  } catch {
    /* offline adapter */
  }
  return updated;
}

export async function fetchDeliveryStatus(
  deliveryId: string,
  actorId: string
): Promise<{ local: Delivery | undefined; adapter: Awaited<ReturnType<ReturnType<typeof getDeliveryApiAdapter>['getStatus']>> }> {
  await authorize(actorId, 'delivery:schedule');
  const local = await get('deliveries', deliveryId);
  const adapter = await getDeliveryApiAdapter().getStatus(deliveryId);
  return { local, adapter };
}

export async function listDeliveries(filters: DeliveryFilters = {}): Promise<Delivery[]> {
  let deliveries: Delivery[];
  if (filters.status) deliveries = await getAllByIndex('deliveries', 'by_status', filters.status);
  else if (filters.date) deliveries = await getAllByIndex('deliveries', 'by_date', filters.date);
  else if (filters.recipientZip) deliveries = await getAllByIndex('deliveries', 'by_zip', filters.recipientZip);
  else deliveries = await getAll('deliveries');
  return deliveries
    .filter((d) => {
      if (filters.status && d.status !== filters.status) return false;
      if (filters.date && d.scheduledDate !== filters.date) return false;
      if (filters.recipientZip && d.recipientZip !== filters.recipientZip) return false;
      if (filters.depotId && d.depotId !== filters.depotId) return false;
      return true;
    })
    .sort((a, b) => (a.scheduledDate + a.scheduledSlot).localeCompare(b.scheduledDate + b.scheduledSlot));
}

export async function getDelivery(id: string): Promise<Delivery | undefined> {
  return await get('deliveries', id);
}

interface PodInput {
  signatureName: string;
  timestamp?: number;
  photoBase64?: string;
}

const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

export async function capturePod(
  deliveryId: string,
  pod: PodInput,
  actorId: string
): Promise<DeliveryPod> {
  await authorize(actorId, 'delivery:pod');
  const delivery = await getDelivery(deliveryId);
  if (!delivery) throw new Error('Delivery not found');
  const signatureName = sanitizeText(pod.signatureName);
  if (!signatureName) throw new Error('Signature name is required');
  if (pod.photoBase64 && pod.photoBase64.length > Math.ceil(MAX_PHOTO_BYTES * 1.4)) {
    throw new Error('Photo exceeds 2 MB limit');
  }
  const record: DeliveryPod = {
    id: uid(),
    deliveryId,
    signatureName,
    timestamp: pod.timestamp ?? Date.now(),
    photoBase64: pod.photoBase64,
    createdAt: Date.now()
  };
  await put('delivery_pods', record);
  await put('deliveries', { ...delivery, status: 'delivered', updatedAt: Date.now() });
  await audit.log({
    actor: actorId,
    action: 'pod_captured',
    resourceType: 'delivery',
    resourceId: deliveryId,
    detail: { signatureName }
  });
  return record;
}

export async function listPods(deliveryId: string): Promise<DeliveryPod[]> {
  return await getAllByIndex('delivery_pods', 'by_delivery', deliveryId);
}

export async function logException(
  deliveryId: string,
  exception: { type: ExceptionType; reason: string },
  actorId: string
): Promise<DeliveryException> {
  await authorize(actorId, 'delivery:exception');
  const delivery = await getDelivery(deliveryId);
  if (!delivery) throw new Error('Delivery not found');
  const reason = sanitizeText(exception.reason);
  if (!reason) throw new Error('Exception reason is required');
  const record: DeliveryException = {
    id: uid(),
    deliveryId,
    type: exception.type,
    reason,
    timestamp: Date.now(),
    reportedBy: actorId
  };
  await put('delivery_exceptions', record);
  await put('deliveries', { ...delivery, status: 'exception', updatedAt: Date.now() });
  await audit.log({
    actor: actorId,
    action: 'delivery_exception',
    resourceType: 'delivery',
    resourceId: deliveryId,
    detail: { type: exception.type, reason }
  });
  return record;
}

export async function listExceptions(deliveryId: string): Promise<DeliveryException[]> {
  return await getAllByIndex('delivery_exceptions', 'by_delivery', deliveryId);
}

export const deliveryService = {
  getAvailableSlots,
  seedDefaultDepot,
  listDepots,
  addDepot,
  checkCoverage,
  calcFreight,
  createDelivery,
  scheduleDelivery,
  cancelDelivery,
  fetchDeliveryStatus,
  listDeliveries,
  getDelivery,
  capturePod,
  listPods,
  logException,
  listExceptions,
  MAX_MILES
};
