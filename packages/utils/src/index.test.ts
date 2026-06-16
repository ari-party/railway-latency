import { describe, expect, it } from 'vitest';

import { cityNameFromProbeId, deriveDisplayStatus, toMapStatus } from '@/index';

const now = Date.now();
const ago = (ms: number) => new Date(now - ms).toISOString();

describe('cityNameFromProbeId', () => {
  it('resolves the city from the last id segment, stripping any index', () => {
    expect(cityNameFromProbeId('sa-cloud-gru')).toBe('São Paulo');
    expect(cityNameFromProbeId('asia-hcloud-sin1')).toBe('Singapore');
    expect(cityNameFromProbeId('af-cloud-jnb')).toBe('Johannesburg');
  });

  it('returns null for an unknown or malformed code', () => {
    expect(cityNameFromProbeId('eu-cloud-zzz')).toBeNull();
    expect(cityNameFromProbeId('weird')).toBeNull();
  });
});

describe('deriveDisplayStatus', () => {
  it('maps active probes by last_seen age', () => {
    expect(deriveDisplayStatus('active', ago(10_000), now)).toBe('green');
    expect(deriveDisplayStatus('active', ago(120_000), now)).toBe('stale');
    expect(deriveDisplayStatus('active', ago(600_000), now)).toBe('down');
    expect(deriveDisplayStatus('active', null, now)).toBe('down');
  });

  it('renders non-active lifecycle states distinctly', () => {
    expect(deriveDisplayStatus('created', null, now)).toBe('pending');
    expect(deriveDisplayStatus('enrolled', null, now)).toBe('pending');
    expect(deriveDisplayStatus('revoked', ago(1), now)).toBe('revoked');
    expect(deriveDisplayStatus('disabled', ago(1), now)).toBe('disabled');
  });
});

describe('toMapStatus', () => {
  it('passes liveness states straight through', () => {
    expect(toMapStatus('green')).toBe('green');
    expect(toMapStatus('stale')).toBe('stale');
    expect(toMapStatus('down')).toBe('down');
  });

  it('collapses lifecycle states into inactive', () => {
    expect(toMapStatus('pending')).toBe('inactive');
    expect(toMapStatus('revoked')).toBe('inactive');
    expect(toMapStatus('disabled')).toBe('inactive');
  });
});
