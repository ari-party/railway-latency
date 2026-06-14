import { describe, expect, it } from 'vitest';

import { EMPTY_PROBE_FORM, validateProbeForm } from '@/lib/probeForm';

import type { ProbeFormValues } from '@/lib/probeForm';

const VALID: ProbeFormValues = {
  probeId: 'asia-hcloud-sin1',
  lat: '1.3521',
  lon: '103.8198',
  host: 'sin1.probes.example.com',
};

describe('validateProbeForm', () => {
  it('accepts a fully valid create form', () => {
    expect(validateProbeForm(VALID, { includeProbeId: true })).toEqual({});
  });

  it('requires probeId only when included', () => {
    const withErrors = validateProbeForm(EMPTY_PROBE_FORM, {
      includeProbeId: true,
    });
    expect(withErrors.probeId).toBeDefined();

    const withoutProbeId = validateProbeForm(EMPTY_PROBE_FORM, {
      includeProbeId: false,
    });
    expect(withoutProbeId.probeId).toBeUndefined();
  });

  it('rejects a probeId that does not match the region-style pattern', () => {
    expect(
      validateProbeForm(
        { ...VALID, probeId: '-leading-hyphen' },
        { includeProbeId: true },
      ).probeId,
    ).toBeDefined();
    expect(
      validateProbeForm(
        { ...VALID, probeId: 'Has-Caps' },
        { includeProbeId: true },
      ).probeId,
    ).toBeDefined();
  });

  it('rejects coordinates that are non-numeric or out of range', () => {
    expect(
      validateProbeForm({ ...VALID, lat: 'abc' }, { includeProbeId: true }).lat,
    ).toBeDefined();
    expect(
      validateProbeForm({ ...VALID, lat: '91' }, { includeProbeId: true }).lat,
    ).toBeDefined();
    expect(
      validateProbeForm({ ...VALID, lon: '-181' }, { includeProbeId: true })
        .lon,
    ).toBeDefined();
  });

  it('accepts an empty host', () => {
    expect(
      validateProbeForm({ ...VALID, host: '' }, { includeProbeId: true }).host,
    ).toBeUndefined();
  });

  it('rejects a host with characters outside the create pattern', () => {
    expect(
      validateProbeForm(
        { ...VALID, host: 'has spaces' },
        { includeProbeId: true },
      ).host,
    ).toBeDefined();
  });
});
