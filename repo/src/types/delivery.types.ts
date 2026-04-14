export type DeliveryStatus = 'scheduled' | 'in_transit' | 'delivered' | 'exception' | 'cancelled';
export type ExceptionType = 'reschedule' | 'refused' | 'loss_damage';

export interface DeliveryItem {
  id: string;
  description: string;
  length?: number;
  quantity: number;
}

export interface Delivery {
  id: string;
  leadId: string | null;
  planId: string | null;
  recipientName: string;
  recipientAddress: string;
  recipientZip: string;
  depotId: string;
  scheduledDate: string;
  scheduledSlot: string;
  status: DeliveryStatus;
  freightCost: number;
  distanceMiles: number;
  hasOversizeItem: boolean;
  items: DeliveryItem[];
  assignedDriver: string;
  createdAt: number;
  updatedAt: number;
}

export interface DeliveryPod {
  id: string;
  deliveryId: string;
  signatureName: string;
  timestamp: number;
  photoBase64?: string;
  createdAt: number;
}

export interface DeliveryException {
  id: string;
  deliveryId: string;
  type: ExceptionType;
  reason: string;
  timestamp: number;
  reportedBy: string;
}

export interface Depot {
  id: string;
  name: string;
  lat: number;
  lng: number;
  zipRanges: string[];
}

export interface FreightResult {
  baseCost: number;
  perMileCost: number;
  oversizeSurcharge: number;
  totalCost: number;
  distanceMiles: number;
  hasOversizeItem: boolean;
}

export interface CoverageResult {
  covered: boolean;
  distanceMiles: number;
  reason?: string;
}

export interface DeliveryFilters {
  status?: DeliveryStatus;
  date?: string;
  recipientZip?: string;
  depotId?: string;
}

export interface DeliveryApiQueueEntry {
  id: string;
  operation: 'scheduleDelivery' | 'cancelDelivery' | 'getStatus';
  payload: unknown;
  mockResponse: unknown;
  queuedAt: number;
  exportedAt: number | null;
}
