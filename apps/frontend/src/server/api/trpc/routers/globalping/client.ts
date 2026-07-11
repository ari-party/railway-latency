import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { globalping } from '@/server/services/globalping';
import { memoize } from '@/server/utils/memoize';

import type { GlobalpingType } from './types';

const PROBES_TTL_SECONDS = 60;

const probeSchema = z.object({
  location: z.object({
    continent: z.string(),
    country: z.string(),
    city: z.string(),
  }),
});

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function fetchProbes(): Promise<
  Array<{ continent: string; country: string; city: string }>
> {
  return memoize(
    'globalping:probes',
    async () => {
      const response = await globalping.get('probes');
      if (!response.ok)
        throw new Error(`globalping probes failed (${response.status})`);

      const body = await response.json();
      if (!Array.isArray(body)) throw new Error('malformed globalping probes');

      // Drop malformed probes, don't fail the whole list.
      return body.flatMap((entry) => {
        const parsed = probeSchema.safeParse(entry);
        return parsed.success ? [parsed.data.location] : [];
      });
    },
    PROBES_TTL_SECONDS,
  );
}

export interface CreateMeasurementInput {
  type: GlobalpingType;
  target: string;
  location: Record<string, string>;
  limit: number;
}

export async function createMeasurement(
  input: CreateMeasurementInput,
): Promise<string> {
  const body: Record<string, unknown> = {
    type: input.type,
    target: input.target,
    locations: [{ ...input.location }],
    limit: input.limit,
  };
  if (input.type === 'http') {
    body.measurementOptions = {
      request: {
        method: 'GET',
        path: '/',
        headers: { 'X-Railway-Debug': '1' },
      },
      protocol: 'HTTPS',
      port: 443,
    };
  }

  const response = await globalping.post('measurements', { json: body });
  if (!response.ok)
    throw new TRPCError({
      code: 'BAD_GATEWAY',
      message: `Globalping rejected the measurement (${response.status})`,
    });

  const data = (await response.json()) as { id?: string };
  if (!data.id)
    throw new TRPCError({
      code: 'BAD_GATEWAY',
      message: 'Globalping response was missing a measurement id',
    });
  return data.id;
}

export interface PollOptions {
  intervalMs?: number;
  timeoutMs?: number;
}

export async function pollMeasurement(
  id: string,
  options: PollOptions = {},
): Promise<{ results: unknown }> {
  const intervalMs = options.intervalMs ?? 500;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const response = await globalping.get(`measurements/${id}`);
    if (!response.ok)
      throw new TRPCError({
        code: 'BAD_GATEWAY',
        message: `Globalping poll failed (${response.status})`,
      });

    const data = (await response.json()) as {
      status?: string;
      results?: unknown;
    };

    if (data.status === 'finished') return { results: data.results };
    if (Date.now() >= deadline)
      throw new TRPCError({
        code: 'TIMEOUT',
        message: 'Globalping measurement did not finish in time',
      });

    await sleep(intervalMs);
  }
}
