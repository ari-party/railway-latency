import express from 'express';
import { z } from 'zod';

import { validateMiddleware } from '@/middleware/validate';
import { log } from '@/pino';

import type { RateLimiter } from '@/services/rateLimit';
import type { SeenReporter } from '@/services/seen';
import type { RosterProbe } from '@/types';
import type { ErrorEvent, ProbeSample } from '@railway-latency/types';
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
]);

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

// Elements stay unknown so one schema-invalid row can't 400 the whole batch; they are validated per-element below.
export const ingestSchema = z
  .object({
    probeId: z
      .string()
      .max(64)
      .regex(/^[a-z0-9][a-z0-9-]*$/),
    samples: z.array(z.unknown()).max(600),
    errors: z.array(z.unknown()).max(600),
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

      if (samples.dropped > 0 || errors.dropped > 0)
        log.warn(
          {
            name: 'ingest',
            probeId: probe.probeId,
            droppedSamples: samples.dropped,
            droppedErrors: errors.dropped,
          },
          'Dropped schema-invalid elements from batch',
        );

      deps.writeExternalSamples(probe, samples.valid);
      deps.writeExternalErrors(probe, errors.valid);
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
