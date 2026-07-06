import express from 'express';
import { z } from 'zod';

import { validateMiddleware } from '@/middleware/validate';
import { log } from '@/pino';

import type { RateLimiter } from '@/services/rateLimit';
import type { SeenReporter } from '@/services/seen';
import type { RosterProbe } from '@/types';
import type {
  CheckEvent,
  ErrorEvent,
  ProbeSample,
} from '@railway-latency/types';
import type { Request, Response, Router } from 'express';

const measurementSchema = z.enum([
  'http',
  'dns',
  'handshake',
  'httpPublic',
  'httpPublicHikari',
  'dnsPublic',
  'handshakePublic',
  'httpProxied',
  'httpProxiedHikari',
  'dnsProxied',
  'handshakeProxied',
  'httpBaseline',
  'dnsBaseline',
  'handshakeBaseline',
]);

const mtrHopSchema = z.object({
  hop: z.number().int().nonnegative(),
  ip: z.string().max(64).optional(),
  ms: z.number().finite().nonnegative().optional(),
});

const probeSampleSchema = z.object({
  measurement: measurementSchema,
  dst: z
    .string()
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]*$/),
  time: z.number().finite().int(),
  ms: z.number().finite(),
  railwayEdge: z.string().max(64).optional(),
  cfPop: z.string().max(64).optional(),
  hikariPop: z.string().max(64).optional(),
  mtr: z.array(mtrHopSchema).max(64).optional(),
});

const errorEventSchema = z.object({
  dst: z
    .string()
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]*$/),
  network: z.enum(['private', 'public', 'proxied']),
  time: z.number().finite().int(),
  reason: z.string().max(256),
});

const checkEventSchema = z.object({
  dst: z
    .string()
    .max(64)
    .regex(/^[a-z0-9][a-z0-9-]*$/),
  network: z.enum(['private', 'public', 'proxied']),
  time: z.number().finite().int(),
  failStage: z.enum(['dns', 'handshake', 'http']).optional(),
  reason: z.string().max(256).optional(),
  dnsMs: z.number().finite().optional(),
  handshakeMs: z.number().finite().optional(),
  httpMs: z.number().finite().optional(),
  httpStatus: z.number().int().min(100).max(599).optional(),
  railwayEdge: z.string().max(64).optional(),
  cfPop: z.string().max(64).optional(),
  hikariPop: z.string().max(64).optional(),
  requestId: z.string().max(128).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  body: z
    .string()
    .max(64 * 1_024)
    .optional(),
  bodyTruncated: z.boolean().optional(),
});

// Elements stay unknown so one schema-invalid row can't 400 the whole batch; they are validated per-element below.
export const ingestSchema = z
  .object({
    probeId: z
      .string()
      .max(64)
      .regex(/^[a-z0-9][a-z0-9-]*$/),
    samples: z.array(z.unknown()).max(600),
    errors: z.array(z.unknown()).max(600),
    checks: z.array(z.unknown()).max(600).optional(),
  })
  .strip();

function partitionValid<T>(
  schema: z.ZodType<T>,
  elements: unknown[],
): { valid: T[]; dropped: number } {
  const valid: T[] = [];
  let dropped = 0;

  for (const element of elements) {
    const result = schema.safeParse(element);
    if (result.success) valid.push(result.data);
    else dropped += 1;
  }

  return { valid, dropped };
}

export interface IngestRouterDeps {
  rateLimiter: RateLimiter;
  writeExternalSamples: (probe: RosterProbe, samples: ProbeSample[]) => void;
  writeExternalErrors: (probe: RosterProbe, errors: ErrorEvent[]) => void;
  writeExternalChecks: (probe: RosterProbe, checks: CheckEvent[]) => void;
  seenReporter: SeenReporter;
}

export function createIngestRouter(deps: IngestRouterDeps): Router {
  const router = express.Router();

  router.post(
    '/',
    validateMiddleware(ingestSchema),
    (request: Request, response: Response) => {
      const { probe } = request;
      if (!probe)
        return response.status(401).json({ message: 'missing token' });

      const body = request.body as z.infer<typeof ingestSchema>;

      if (body.probeId !== probe.probeId)
        return response.status(403).json({ message: 'probe id mismatch' });

      if (!deps.rateLimiter.consume(probe.probeId))
        return response.status(429).json({ message: 'rate limited' });

      const samples = partitionValid(probeSampleSchema, body.samples);
      const errors = partitionValid(errorEventSchema, body.errors);
      const checks = partitionValid(checkEventSchema, body.checks ?? []);

      if (samples.dropped > 0 || errors.dropped > 0 || checks.dropped > 0)
        log.warn(
          {
            name: 'ingest',
            probeId: probe.probeId,
            droppedSamples: samples.dropped,
            droppedErrors: errors.dropped,
            droppedChecks: checks.dropped,
          },
          'Dropped schema-invalid elements from batch',
        );

      deps.writeExternalSamples(probe, samples.valid);
      deps.writeExternalErrors(probe, errors.valid);
      deps.writeExternalChecks(probe, checks.valid);
      deps.seenReporter.record(probe.probeId);

      return response.status(202).json({
        accepted: {
          samples: samples.valid.length,
          errors: errors.valid.length,
        },
      });
    },
  );

  return router;
}
