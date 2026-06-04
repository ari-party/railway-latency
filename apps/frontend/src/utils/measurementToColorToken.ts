import type { Measurement } from '@railway-latency/types';

export default function measurementToColorToken(measurement: Measurement) {
  switch (measurement) {
    case 'http':
    case 'httpProxied':
      return 'blue.600';
    case 'httpPublic':
      return 'blue.300';
    case 'httpPublicHikari':
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
