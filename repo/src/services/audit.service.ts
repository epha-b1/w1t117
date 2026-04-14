import { getDb, getAll, getAllByIndex, put } from './db';
import { uid } from '../utils/uid';
import type { AuditEntry } from '../types/db.types';

export interface AuditFilters {
  actor?: string;
  action?: string;
  resourceType?: string;
  from?: number;
  to?: number;
}

const RETENTION_MS = 180 * 24 * 60 * 60 * 1000;
export const AUDIT_RETENTION_MS = RETENTION_MS;

export function matchesFilters(entry: AuditEntry, filters: AuditFilters): boolean {
  if (filters.from != null && entry.timestamp < filters.from) return false;
  if (filters.to != null && entry.timestamp > filters.to) return false;
  if (filters.actor && entry.actor !== filters.actor) return false;
  if (filters.action && entry.action !== filters.action) return false;
  if (filters.resourceType && entry.resourceType !== filters.resourceType) return false;
  return true;
}

export async function log(entry: Omit<AuditEntry, 'id' | 'timestamp'>): Promise<void> {
  const record: AuditEntry = {
    ...entry,
    id: uid(),
    timestamp: Date.now()
  };
  await put('audit_log', record);
}

export async function listEntries(filters: AuditFilters = {}): Promise<AuditEntry[]> {
  let entries: AuditEntry[];
  if (filters.actor) {
    entries = await getAllByIndex('audit_log', 'by_actor', filters.actor);
  } else if (filters.action) {
    entries = await getAllByIndex('audit_log', 'by_action', filters.action);
  } else if (filters.resourceType) {
    entries = await getAllByIndex('audit_log', 'by_resourceType', filters.resourceType);
  } else {
    entries = await getAll('audit_log');
  }
  return entries
    .filter((e) => matchesFilters(e, filters))
    .sort((a, b) => b.timestamp - a.timestamp);
}

export async function purgeOldEntries(now: number = Date.now()): Promise<number> {
  const cutoff = now - RETENTION_MS;
  const db = await getDb();
  const tx = db.transaction('audit_log', 'readwrite');
  const idx = tx.store.index('by_timestamp');
  let count = 0;
  let cursor = await idx.openCursor(IDBKeyRange.upperBound(cutoff, true));
  while (cursor) {
    await cursor.delete();
    count++;
    cursor = await cursor.continue();
  }
  await tx.done;
  return count;
}

export const auditService = { log, listEntries, purgeOldEntries };
