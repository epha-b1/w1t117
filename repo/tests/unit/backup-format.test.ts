import { describe, it, expect } from 'vitest';
import {
  validateExportBundle,
  validateEncryptedBundle,
  BACKUP_VERSION
} from '../../src/services/backup.service';

describe('backup bundle format validation', () => {
  it('accepts a well-formed plain export bundle', () => {
    const ok = validateExportBundle({
      version: BACKUP_VERSION,
      sha256: 'a'.repeat(64),
      exportedAt: Date.now(),
      stores: {}
    });
    expect(ok.ok).toBe(true);
  });

  it('rejects missing or wrong version', () => {
    expect(validateExportBundle({
      version: '0', sha256: 'a'.repeat(64), exportedAt: 1, stores: {}
    }).ok).toBe(false);
    expect(validateExportBundle({ sha256: 'a'.repeat(64), exportedAt: 1, stores: {} }).ok).toBe(false);
  });

  it('rejects malformed sha256', () => {
    const r = validateExportBundle({
      version: BACKUP_VERSION, sha256: 'short', exportedAt: 1, stores: {}
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/sha256/);
  });

  it('rejects non-object input', () => {
    expect(validateExportBundle(null).ok).toBe(false);
    expect(validateExportBundle('string').ok).toBe(false);
    expect(validateExportBundle(42).ok).toBe(false);
  });

  it('accepts a well-formed encrypted bundle', () => {
    expect(validateEncryptedBundle({
      version: '1',
      sha256: 'a'.repeat(64),
      salt: 'c2FsdA==',
      iv: 'aXY=',
      data: 'ZGF0YQ=='
    }).ok).toBe(true);
  });

  it('rejects encrypted bundle missing any required field', () => {
    const valid = {
      version: '1', sha256: 'a'.repeat(64),
      salt: 'c2FsdA==', iv: 'aXY=', data: 'ZGF0YQ=='
    };
    for (const key of ['version', 'sha256', 'salt', 'iv', 'data'] as const) {
      const copy = { ...valid } as Record<string, unknown>;
      delete copy[key];
      expect(validateEncryptedBundle(copy).ok).toBe(false);
    }
  });
});
