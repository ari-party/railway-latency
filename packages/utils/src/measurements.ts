import type {
  Measurement,
  Network,
  ProbeMeasurement,
} from '@railway-latency/types';

export type BaselineMeasurement =
  | 'dnsBaseline'
  | 'handshakeBaseline'
  | 'httpBaseline';

export type NetworkMeasurement = Exclude<Measurement, BaselineMeasurement>;

export const MEASUREMENT_INFO: Record<
  NetworkMeasurement,
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
  (Object.keys(MEASUREMENT_INFO) as NetworkMeasurement[]).filter(
    (measurement) => MEASUREMENT_INFO[measurement].net !== 'private',
  ),
);

export const BASELINE_MEASUREMENTS: ReadonlySet<Measurement> =
  new Set<Measurement>(['dnsBaseline', 'handshakeBaseline', 'httpBaseline']);

export function networkForMeasurement(
  measurement: NetworkMeasurement,
): Network {
  return MEASUREMENT_INFO[measurement].net;
}
