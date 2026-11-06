import type {
  Measurement,
  Network,
  ProbeMeasurement,
} from '@railway-latency/types';

export const MEASUREMENT_INFO: Record<
  Measurement,
  { net: Network; type: keyof ProbeMeasurement }
> = {
  http: { net: 'private', type: 'http' },
  dns: { net: 'private', type: 'dns' },
  handshake: { net: 'private', type: 'handshake' },
  httpPublic: { net: 'public', type: 'http' },
  httpPublicHikari: { net: 'public', type: 'http' },
  dnsPublic: { net: 'public', type: 'dns' },
  handshakePublic: { net: 'public', type: 'handshake' },
  httpProxied: { net: 'proxied', type: 'http' },
  httpProxiedHikari: { net: 'proxied', type: 'http' },
  dnsProxied: { net: 'proxied', type: 'dns' },
  handshakeProxied: { net: 'proxied', type: 'handshake' },
};

export const EXTERNAL_MEASUREMENTS: ReadonlySet<Measurement> = new Set(
  (Object.keys(MEASUREMENT_INFO) as Measurement[]).filter(
    (measurement) => MEASUREMENT_INFO[measurement].net !== 'private',
  ),
);

export function networkForMeasurement(measurement: Measurement): Network {
  return MEASUREMENT_INFO[measurement].net;
}
