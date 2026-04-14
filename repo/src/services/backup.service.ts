import { getAll, put, clear, ALL_STORES } from './db';
import {
  sha256Hex,
  encryptAes256Gcm,
  decryptAes256Gcm,
  type EncryptedBundle
} from '../utils/crypto';
import type { StoreName } from '../types/db.types';
import * as audit from './audit.service';
import { authorize } from './authz.service';

export const BACKUP_VERSION = '1';

export function validateExportBundle(raw: unknown): { ok: true; bundle: ExportBundle } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Bundle is not an object' };
  const b = raw as Record<string, unknown>;
  if (typeof b.version !== 'string') return { ok: false, error: 'Missing version' };
  if (b.version !== BACKUP_VERSION) return { ok: false, error: 'Unsupported backup version' };
  if (typeof b.sha256 !== 'string' || b.sha256.length !== 64) return { ok: false, error: 'Missing or malformed sha256' };
  if (typeof b.exportedAt !== 'number') return { ok: false, error: 'Missing exportedAt' };
  if (!b.stores || typeof b.stores !== 'object') return { ok: false, error: 'Missing stores' };
  return { ok: true, bundle: b as unknown as ExportBundle };
}

export function validateEncryptedBundle(raw: unknown): { ok: true } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Bundle is not an object' };
  const b = raw as Record<string, unknown>;
  if (b.version !== '1') return { ok: false, error: 'Unsupported encrypted bundle version' };
  if (typeof b.sha256 !== 'string' || b.sha256.length !== 64) return { ok: false, error: 'Missing sha256' };
  if (typeof b.salt !== 'string' || !b.salt) return { ok: false, error: 'Missing salt' };
  if (typeof b.iv !== 'string' || !b.iv) return { ok: false, error: 'Missing iv' };
  if (typeof b.data !== 'string' || !b.data) return { ok: false, error: 'Missing data' };
  return { ok: true };
}

export interface ExportBundle {
  version: string;
  exportedAt: number;
  sha256: string;
  stores: Record<string, unknown[]>;
}

export interface ImportResult {
  success: boolean;
  recordsRestored: number;
  error?: string;
}

async function collectData(): Promise<Record<string, unknown[]>> {
  const data: Record<string, unknown[]> = {};
  for (const name of ALL_STORES) {
    data[name] = await getAll(name);
  }
  return data;
}

export async function exportData(actorId?: string): Promise<Blob> {
  await authorize(actorId ?? 'system', 'backup:export');
  const stores = await collectData();
  const payload = { version: BACKUP_VERSION, exportedAt: Date.now(), stores };
  const serialized = JSON.stringify(payload);
  const sha256 = await sha256Hex(serialized);
  const bundle: ExportBundle = { ...payload, sha256 };
  const json = JSON.stringify(bundle);
  if (actorId) {
    await audit.log({
      actor: actorId,
      action: 'backup_export',
      resourceType: 'backup',
      resourceId: '',
      detail: { size: json.length }
    });
  }
  return new Blob([json], { type: 'application/json' });
}

export async function importData(file: File, actorId?: string): Promise<ImportResult> {
  try {
    await authorize(actorId ?? 'system', 'backup:import');
    const text = await file.text();
    const bundle = JSON.parse(text) as Partial<ExportBundle>;
    if (!bundle.version || !bundle.sha256 || !bundle.stores) {
      return { success: false, recordsRestored: 0, error: 'Invalid backup format' };
    }
    if (bundle.version !== BACKUP_VERSION) {
      return { success: false, recordsRestored: 0, error: 'Unsupported backup version' };
    }
    const { sha256, ...rest } = bundle;
    const recomputed = await sha256Hex(JSON.stringify(rest));
    if (recomputed !== sha256) {
      return { success: false, recordsRestored: 0, error: 'Fingerprint mismatch — file integrity check failed' };
    }
    const restored = await restoreStores(bundle.stores!);
    if (actorId) {
      await audit.log({
        actor: actorId,
        action: 'backup_import',
        resourceType: 'backup',
        resourceId: '',
        detail: { recordsRestored: restored }
      });
    }
    return { success: true, recordsRestored: restored };
  } catch (e) {
    return { success: false, recordsRestored: 0, error: (e as Error).message };
  }
}

export async function exportEncrypted(passphrase: string, actorId?: string): Promise<Blob> {
  await authorize(actorId ?? 'system', 'backup:export');
  const stores = await collectData();
  const payload = { version: BACKUP_VERSION, exportedAt: Date.now(), stores };
  const serialized = JSON.stringify(payload);
  const bundle = await encryptAes256Gcm(serialized, passphrase);
  if (actorId) {
    await audit.log({
      actor: actorId,
      action: 'backup_export_encrypted',
      resourceType: 'backup',
      resourceId: '',
      detail: {}
    });
  }
  return new Blob([JSON.stringify(bundle)], { type: 'application/json' });
}

export async function importEncrypted(
  file: File,
  passphrase: string,
  actorId?: string
): Promise<ImportResult> {
  try {
    await authorize(actorId ?? 'system', 'backup:import');
    const text = await file.text();
    const bundle = JSON.parse(text) as EncryptedBundle;
    if (!bundle || bundle.version !== '1' || !bundle.data || !bundle.iv || !bundle.salt || !bundle.sha256) {
      return { success: false, recordsRestored: 0, error: 'Invalid encrypted bundle format' };
    }
    const plaintext = await decryptAes256Gcm(bundle, passphrase);
    const payload = JSON.parse(plaintext) as { version: string; stores: Record<string, unknown[]> };
    if (payload.version !== BACKUP_VERSION) {
      return { success: false, recordsRestored: 0, error: 'Unsupported backup version' };
    }
    const restored = await restoreStores(payload.stores);
    if (actorId) {
      await audit.log({
        actor: actorId,
        action: 'backup_import_encrypted',
        resourceType: 'backup',
        resourceId: '',
        detail: { recordsRestored: restored }
      });
    }
    return { success: true, recordsRestored: restored };
  } catch (e) {
    return { success: false, recordsRestored: 0, error: (e as Error).message };
  }
}

async function restoreStores(stores: Record<string, unknown[]>): Promise<number> {
  let count = 0;
  for (const name of ALL_STORES) {
    await clear(name);
    const records = stores[name] ?? [];
    for (const r of records) {
      await put(name as StoreName, r as never);
      count++;
    }
  }
  return count;
}

export const backupService = {
  exportData,
  importData,
  exportEncrypted,
  importEncrypted,
  BACKUP_VERSION
};
