import type { Measurement } from '@railway-latency/types';

export default function measurementToColorToken(measurement: Measurement) {
  switch (measurement) {
    case 'http':
    case 'httpPublic':
    case 'httpProxied':
      return 'blue.600';
    case 'httpPublicHikari':
      return 'purple.600';
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
