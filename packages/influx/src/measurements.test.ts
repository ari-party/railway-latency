import { describe, expect, it } from 'vitest';

import { EXTERNAL_MEASUREMENTS, MEASUREMENT_INFO } from '@/measurements';

describe('EXTERNAL_MEASUREMENTS', () => {
  it('contains every public and proxied measurement', () => {
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

  it('excludes every private measurement', () => {
    expect(EXTERNAL_MEASUREMENTS.has('http')).toBe(false);
    expect(EXTERNAL_MEASUREMENTS.has('dns')).toBe(false);
    expect(EXTERNAL_MEASUREMENTS.has('handshake')).toBe(false);
  });

  it('marks each measurement with its network and base type', () => {
    expect(MEASUREMENT_INFO.httpProxiedHikari).toEqual({
      net: 'proxied',
      type: 'http',
    });
    expect(MEASUREMENT_INFO.http).toEqual({ net: 'private', type: 'http' });
  });
});
