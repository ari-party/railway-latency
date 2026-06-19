import { describe, expect, it } from 'vitest';

import {
  EXTERNAL_MEASUREMENTS,
  MEASUREMENT_INFO,
  networkForMeasurement,
} from '@/measurements';

describe('measurement metadata', () => {
  it('maps measurements to their network', () => {
    expect(networkForMeasurement('http')).toBe('private');
    expect(networkForMeasurement('httpPublicHikari')).toBe('public');
    expect(networkForMeasurement('dnsProxied')).toBe('proxied');
  });

  it('contains exactly the non-private measurements', () => {
    expect([...EXTERNAL_MEASUREMENTS].sort()).toEqual(
      [
        'dnsProxied',
        'dnsPublic',
        'handshakeProxied',
        'handshakePublic',
        'httpProxied',
        'httpProxiedHikari',
        'httpPublic',
        'httpPublicHikari',
      ].sort(),
    );
  });

  it('excludes private measurements from the external set', () => {
    expect(EXTERNAL_MEASUREMENTS.has('http')).toBe(false);
    expect(EXTERNAL_MEASUREMENTS.has('dns')).toBe(false);
    expect(EXTERNAL_MEASUREMENTS.has('handshake')).toBe(false);
    expect(Object.keys(MEASUREMENT_INFO)).toHaveLength(11);
  });
});
