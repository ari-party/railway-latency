import { z } from 'zod';

import type { GlobalpingProbeResult, GlobalpingType } from './types';

export function targetHost(
  slug: string,
  environment: string | undefined,
): string {
  const suffix = environment === 'dev' ? '-dev' : '';
  return `${slug}-echo${suffix}.up.railway.app`;
}

export function hikariPopFromTrace(
  trace: string | null | undefined,
): string | null {
  if (!trace) return null;
  const first = trace.split(',')[0]?.trim() ?? '';
  const code = first.split('.')[0]?.trim() ?? '';
  return code === '' ? null : code;
}

export function cfPopFromRay(ray: string | null | undefined): string | null {
  if (!ray) return null;
  const dash = ray.lastIndexOf('-');
  if (dash < 0) return null;
  const pop = ray.slice(dash + 1).trim();
  return pop === '' ? null : pop;
}

const headerValueSchema = z.union([z.string(), z.array(z.string())]);
const headersSchema = z.record(z.string(), headerValueSchema).default({});

const probeLocationSchema = z.object({
  continent: z.string(),
  region: z.string(),
  country: z.string(),
  state: z.string().nullable().default(null),
  city: z.string(),
  asn: z.number(),
  network: z.string(),
  latitude: z.number(),
  longitude: z.number(),
});

const httpResultSchema = z.object({
  status: z.enum(['finished', 'failed']).catch('failed'),
  statusCode: z.number().nullable().default(null),
  headers: headersSchema,
  timings: z
    .object({
      total: z.number().nullable().default(null),
      dns: z.number().nullable().default(null),
      tcp: z.number().nullable().default(null),
      tls: z.number().nullable().default(null),
      firstByte: z.number().nullable().default(null),
      download: z.number().nullable().default(null),
    })
    .nullable()
    .default(null),
});

const mtrResultSchema = z.object({
  status: z.enum(['finished', 'failed']).catch('failed'),
  hops: z
    .array(
      z.object({
        resolvedHostname: z.string().nullable().default(null),
        resolvedAddress: z.string().nullable().default(null),
        asn: z.array(z.number()).default([]),
        stats: z
          .object({
            min: z.number().nullable().default(null),
            avg: z.number().nullable().default(null),
            max: z.number().nullable().default(null),
            loss: z.number().nullable().default(null),
          })
          .default({ min: null, avg: null, max: null, loss: null }),
      }),
    )
    .default([]),
});

const entrySchema = z.object({
  probe: probeLocationSchema,
  result: z.unknown(),
});

type RawHeaders = z.infer<typeof headersSchema>;

function readHeader(headers: RawHeaders, name: string): string | null {
  const target = name.toLowerCase();

  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== target) continue;
    if (Array.isArray(value)) return value[0] ?? null;

    return value;
  }

  return null;
}

function flattenHeaders(headers: RawHeaders): Record<string, string> {
  const out: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    out[key] = Array.isArray(value) ? value.join(', ') : value;
  }

  return out;
}

export function parseProbeResults(
  type: GlobalpingType,
  results: unknown,
): GlobalpingProbeResult[] {
  const parsed = z.array(entrySchema).safeParse(results);
  if (!parsed.success) return [];

  return parsed.data.map(({ probe, result }) => {
    const location = {
      continent: probe.continent,
      region: probe.region,
      country: probe.country,
      state: probe.state,
      city: probe.city,
      asn: probe.asn,
      network: probe.network,
      lat: probe.latitude,
      lon: probe.longitude,
    };

    if (type === 'http') {
      const http = httpResultSchema.safeParse(result);
      const data = http.success
        ? http.data
        : {
            status: 'failed' as const,
            statusCode: null,
            headers: {},
            timings: null,
          };

      return {
        probe: location,
        status: data.status,
        statusCode: data.statusCode,
        timings: data.timings,
        headers: flattenHeaders(data.headers),
        hikariPop: hikariPopFromTrace(
          readHeader(data.headers, 'x-hikari-trace'),
        ),
        railwayEdge: readHeader(data.headers, 'x-railway-upstream-zone'),
        cfPop: cfPopFromRay(readHeader(data.headers, 'cf-ray')),
      };
    }

    const mtr = mtrResultSchema.safeParse(result);
    const data = mtr.success
      ? mtr.data
      : { status: 'failed' as const, hops: [] };

    return {
      probe: location,
      status: data.status,
      hops: data.hops.map((hop) => ({
        resolvedHostname: hop.resolvedHostname,
        resolvedAddress: hop.resolvedAddress,
        asn: hop.asn,
        min: hop.stats.min,
        avg: hop.stats.avg,
        max: hop.stats.max,
        loss: hop.stats.loss,
      })),
    };
  });
}
