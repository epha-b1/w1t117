import { describe, it, expect } from 'vitest';
import { buildStubResponse } from '../../src/services/delivery-api.service';

describe('offline stub response builder', () => {
  it('returns success: true with external ID derived from delivery ID', () => {
    const r = buildStubResponse('scheduleDelivery', 'abcd1234-rest');
    expect(r.success).toBe(true);
    expect(r.externalId).toBe('STUB-ABCD1234');
    expect(r.status).toBe('scheduled');
  });

  it('maps cancel op to cancelled status', () => {
    const r = buildStubResponse('cancelDelivery', 'deadbeef');
    expect(r.status).toBe('cancelled');
  });

  it('maps getStatus op to scheduled status', () => {
    const r = buildStubResponse('getStatus', 'deadbeef');
    expect(r.status).toBe('scheduled');
  });

  it('always emits the offline marker message', () => {
    const r = buildStubResponse('scheduleDelivery', 'x');
    expect(r.message).toMatch(/offline stub/i);
  });
});
