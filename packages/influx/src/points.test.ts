import { describe, expect, it } from 'vitest';

import { buildErrorPoint, buildMtrPoint, buildSamplePoint } from '@/points';

import type { Point } from '@influxdata/influxdb-client';
import type { ErrorEvent, ProbeSample } from '@railway-latency/types';

function line(point: Point): string {
  return point.toLineProtocol() ?? '';
}

describe('buildSamplePoint', () => {
  const sample: ProbeSample = {
    measurement: 'httpPublic',
    dst: 'asia-southeast1',
    time: 1_700_000_000_000,
    ms: 12.5,
  };

  it('emits measurement, sorted src/dst tags, ms field and ns timestamp', () => {
    const result = line(buildSamplePoint('europe-west4', sample));

    expect(result).toBe(
      'httpPublic,dst=asia-southeast1,src=europe-west4 ms=12.5 1700000000000000000',
    );
  });

  it('omits optional string fields when absent', () => {
    const result = line(buildSamplePoint('europe-west4', sample));

    expect(result).not.toContain('railway_edge');
    expect(result).not.toContain('cf_pop');
    expect(result).not.toContain('hikari_pop');
  });

  it('includes optional routing string fields (alphabetically sorted) when present', () => {
    const enriched: ProbeSample = {
      ...sample,
      railwayEdge: 'edge-1',
      cfPop: 'AMS',
      hikariPop: 'sin',
    };

    const result = line(buildSamplePoint('europe-west4', enriched));

    expect(result).toBe(
      'httpPublic,dst=asia-southeast1,src=europe-west4 cf_pop="AMS",hikari_pop="sin",ms=12.5,railway_edge="edge-1" 1700000000000000000',
    );
  });

  it('adds the origin tag only when supplied', () => {
    const withOrigin = line(
      buildSamplePoint('asia-hcloud-sin1', sample, { origin: 'external' }),
    );

    expect(withOrigin).toBe(
      'httpPublic,dst=asia-southeast1,origin=external,src=asia-hcloud-sin1 ms=12.5 1700000000000000000',
    );

    const withoutOrigin = line(buildSamplePoint('asia-hcloud-sin1', sample));
    expect(withoutOrigin).not.toContain('origin=');
  });

  it('sanitizes CR/LF/tab in routing string fields to a single well-formed line', () => {
    const injected: ProbeSample = {
      ...sample,
      railwayEdge: 'edge\r\n1',
      cfPop: 'AM\tS',
      hikariPop: 'si\nn',
    };

    const result = line(buildSamplePoint('europe-west4', injected));

    expect(result.split('\n')).toHaveLength(1);
    expect(result).toBe(
      'httpPublic,dst=asia-southeast1,src=europe-west4 cf_pop="AM S",hikari_pop="si n",ms=12.5,railway_edge="edge  1" 1700000000000000000',
    );
  });
});

describe('buildMtrPoint', () => {
  const sample: ProbeSample = {
    measurement: 'httpProxied',
    dst: 'asia-southeast1',
    time: 1_700_000_000_000,
    ms: 12.5,
    mtr: [
      { hop: 1, ip: '10.0.0.1', ms: 0.5 },
      { hop: 2, ip: '203.0.113.7', host: 'core.example.net', ms: 12.3 },
    ],
  };

  it('emits an mtr point with src/dst/network tags and the hops as a JSON string field', () => {
    const result = line(buildMtrPoint('europe-west4', sample));

    expect(result).toMatch(
      /^mtr,dst=asia-southeast1,network=proxied,src=europe-west4 hops=".+" 1700000000000000000$/,
    );

    const hopsJson = result.slice(
      result.indexOf('hops="') + 'hops="'.length,
      result.lastIndexOf('" '),
    );
    expect(JSON.parse(hopsJson.replace(/\\"/g, '"'))).toEqual(sample.mtr);
  });

  it('serializes an empty array when no hops are present', () => {
    const result = line(
      buildMtrPoint('europe-west4', { ...sample, mtr: undefined }),
    );

    expect(result).toBe(
      'mtr,dst=asia-southeast1,network=proxied,src=europe-west4 hops="[]" 1700000000000000000',
    );
  });

  it('adds the origin tag only when supplied', () => {
    const withOrigin = line(
      buildMtrPoint('asia-hcloud-sin1', sample, { origin: 'external' }),
    );

    expect(withOrigin).toContain(
      'mtr,dst=asia-southeast1,network=proxied,origin=external,src=asia-hcloud-sin1 ',
    );

    const withoutOrigin = line(buildMtrPoint('asia-hcloud-sin1', sample));
    expect(withoutOrigin).not.toContain('origin=');
  });
});

describe('buildErrorPoint', () => {
  const error: ErrorEvent = {
    dst: 'asia-southeast1',
    network: 'public',
    time: 1_700_000_000_000,
    reason: 'connection reset',
  };

  it('emits measurement "error", sorted src/dst/network tags and a reason field', () => {
    const result = line(buildErrorPoint('europe-west4', error));

    expect(result).toBe(
      'error,dst=asia-southeast1,network=public,src=europe-west4 reason="connection reset" 1700000000000000000',
    );
  });

  it('adds the origin tag only when supplied', () => {
    const withOrigin = line(
      buildErrorPoint('asia-hcloud-sin1', error, { origin: 'external' }),
    );

    expect(withOrigin).toBe(
      'error,dst=asia-southeast1,network=public,origin=external,src=asia-hcloud-sin1 reason="connection reset" 1700000000000000000',
    );

    const withoutOrigin = line(buildErrorPoint('asia-hcloud-sin1', error));
    expect(withoutOrigin).not.toContain('origin=');
  });

  it('sanitizes CR/LF/tab in reason to a single well-formed line', () => {
    const injected: ErrorEvent = {
      ...error,
      reason: 'connection reset\nmalicious,dst=x src=y ms=0',
    };

    const result = line(buildErrorPoint('europe-west4', injected));

    expect(result.split('\n')).toHaveLength(1);
    expect(result).toBe(
      'error,dst=asia-southeast1,network=public,src=europe-west4 reason="connection reset malicious,dst=x src=y ms=0" 1700000000000000000',
    );
  });
});
