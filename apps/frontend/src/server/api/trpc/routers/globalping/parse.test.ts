import { describe, expect, it } from 'vitest';

import {
  cfPopFromRay,
  hikariPopFromTrace,
  parseProbeResults,
  targetHost,
} from './parse';

describe('targetHost', () => {
  it('builds the public echo host with no suffix outside dev', () => {
    expect(targetHost('us-east4-eqdc4a', 'prod')).toBe(
      'us-east4-eqdc4a-echo.up.railway.app',
    );
    expect(targetHost('us-west2', undefined)).toBe(
      'us-west2-echo.up.railway.app',
    );
  });

  it('appends -dev in the dev environment', () => {
    expect(targetHost('us-west2', 'dev')).toBe(
      'us-west2-echo-dev.up.railway.app',
    );
  });
});

describe('hikariPopFromTrace', () => {
  it('takes the first CSV entry before the dot', () => {
    expect(hikariPopFromTrace('ams1.aydy')).toBe('ams1');
    expect(hikariPopFromTrace('ams1.aydy, fra2.bxcz')).toBe('ams1');
  });

  it('returns null for empty / missing traces', () => {
    expect(hikariPopFromTrace('')).toBeNull();
    expect(hikariPopFromTrace(undefined)).toBeNull();
    expect(hikariPopFromTrace(null)).toBeNull();
  });
});

describe('cfPopFromRay', () => {
  it('returns the suffix after the last dash', () => {
    expect(cfPopFromRay('8f2abc123-AMS')).toBe('AMS');
  });

  it('returns null when there is no dash', () => {
    expect(cfPopFromRay('nodash')).toBeNull();
    expect(cfPopFromRay(null)).toBeNull();
  });
});

describe('parseProbeResults (http)', () => {
  const results = [
    {
      probe: {
        continent: 'EU',
        region: 'Western Europe',
        country: 'DE',
        state: null,
        city: 'Berlin',
        asn: 3320,
        network: 'Deutsche Telekom',
        latitude: 52.52,
        longitude: 13.4,
      },
      result: {
        status: 'finished',
        statusCode: 200,
        headers: {
          'x-hikari-trace': 'fra1.abcd, ams2.efgh',
          'x-railway-upstream-zone': 'railway/europe-west4-drams3a',
          'cf-ray': '90ab-FRA',
        },
        timings: {
          total: 120,
          dns: 2,
          tcp: 10,
          tls: 20,
          firstByte: 80,
          download: 8,
        },
      },
    },
  ];

  it('maps probe coords and extracts routing headers', () => {
    const parsed = parseProbeResults('http', results);
    expect(parsed).toHaveLength(1);
    const [entry] = parsed;
    expect(entry.probe.lat).toBe(52.52);
    expect(entry.probe.lon).toBe(13.4);
    expect(entry.probe.city).toBe('Berlin');
    expect(entry.status).toBe('finished');
    expect(entry.statusCode).toBe(200);
    expect(entry.hikariPop).toBe('fra1');
    expect(entry.railwayEdge).toBe('railway/europe-west4-drams3a');
    expect(entry.cfPop).toBe('FRA');
    expect(entry.timings?.firstByte).toBe(80);
  });

  it('returns null routing fields when the debug headers are absent', () => {
    const [entry] = parseProbeResults('http', [
      {
        ...results[0],
        result: {
          status: 'finished',
          statusCode: 200,
          headers: {},
          timings: null,
        },
      },
    ]);
    expect(entry.hikariPop).toBeNull();
    expect(entry.cfPop).toBeNull();
  });

  it('drops entries with a malformed probe object', () => {
    expect(
      parseProbeResults('http', [{ probe: { city: 'X' }, result: {} }]),
    ).toEqual([]);
    expect(parseProbeResults('http', 'not-an-array')).toEqual([]);
  });
});

describe('parseProbeResults (mtr)', () => {
  it('flattens hop stats', () => {
    const parsed = parseProbeResults('mtr', [
      {
        probe: {
          continent: 'NA',
          region: 'Northern America',
          country: 'US',
          state: 'VA',
          city: 'Ashburn',
          asn: 14618,
          network: 'Amazon',
          latitude: 39.0,
          longitude: -77.5,
        },
        result: {
          status: 'finished',
          hops: [
            {
              resolvedHostname: 'gw.example',
              resolvedAddress: '10.0.0.1',
              asn: [14618],
              timings: [{ rtt: 1.2 }],
              stats: { min: 1.1, avg: 1.3, max: 1.9, loss: 0 },
            },
          ],
        },
      },
    ]);
    expect(parsed[0].hops).toEqual([
      {
        resolvedHostname: 'gw.example',
        resolvedAddress: '10.0.0.1',
        asn: [14618],
        min: 1.1,
        avg: 1.3,
        max: 1.9,
        loss: 0,
      },
    ]);
  });
});
