import type { Measurement } from '@railway-latency/types';

export default function measurementToColorToken(measurement: Measurement) {
  switch (measurement) {
    case 'http':
      return 'blue.600';
    case 'httpPublic':
    case 'httpProxied':
      return 'blue.300';
    case 'httpPublicHikari':
    case 'httpProxiedHikari':
      return 'blue.600';
    case 'dns':
    case 'dnsPublic':
    case 'dnsProxied':
      return 'pink.600';
    case 'handshake':
    case 'handshakePublic':
    case 'handshakeProxied':
      return 'teal.600';
  }
}
