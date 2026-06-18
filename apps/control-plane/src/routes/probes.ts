import { Router } from 'express';
import { z } from 'zod';

import { insertEnrollmentToken } from '@/db/enrollmentTokens';
import {
  getConvergeOutcome,
  listConvergeOutcomes,
  listEvents,
  recordEvent,
} from '@/db/events';
import {
  createProbe,
  deleteProbe,
  disableProbe,
  getProbe,
  listProbes,
  patchProbe,
  revokeProbeKey,
  setProbeApiKey,
} from '@/db/probes';
import { env } from '@/env';
import { validateMiddleware } from '@/middleware/validate';
import { fireConverge, isRunning, runPlaybook } from '@/services/ansible';
import { mintApiKey, mintEnrollmentToken } from '@/services/apikey';
import { installCommand } from '@/services/install';
import { lookupAsn } from '@/services/ip2location';
import { releaseTagExists } from '@/services/releases';
import { secretStash } from '@/services/secretStash';

import type { ProbeRow } from '@/db/probes';
import type {
  LifecycleStatus,
  Probe,
  ProbeConverge,
} from '@railway-latency/types';

const probesRouter = Router();

const ENROLL_TOKEN_TTL_MINUTES = 10;

function serializeProbe(probe: ProbeRow, converge: ProbeConverge): Probe {
  return {
    probeId: probe.probeId,
    lat: probe.lat,
    lon: probe.lon,
    status: probe.status as LifecycleStatus,
    deployedSha: probe.deployedSha,
    host: probe.host,
    lastSeen: probe.lastSeen,
    converge,
  };
}

async function convergeState(probeId: string): Promise<ProbeConverge> {
  const outcome = await getConvergeOutcome(probeId);
  return {
    running: isRunning(probeId),
    lastResult: outcome?.result ?? null,
    lastEventAt: outcome?.at ?? null,
  };
}

const probeIdSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/)
  .refine((id) => !env.RAILWAY_REPLICA_REGIONS.includes(id), {
    message: 'probe_id collides with a Railway region slug',
    params: { collision: true },
  });

const createSchema = z.object({
  probeId: probeIdSchema,
  lat: z.number(),
  lon: z.number(),
  host: z
    .string()
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/)
    .optional(),
});

const patchSchema = z
  .object({
    lat: z.number().optional(),
    lon: z.number().optional(),
    host: z
      .string()
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/)
      .optional(),
  })
  .strip();

type ReleaseTagCheck = 'present' | 'absent' | 'unavailable';

async function checkReleaseTag(sha: string): Promise<ReleaseTagCheck> {
  try {
    return (await releaseTagExists(sha)) ? 'present' : 'absent';
  } catch {
    return 'unavailable';
  }
}

async function issueEnrollment(probeId: string) {
  const enrollToken = mintEnrollmentToken();
  await insertEnrollmentToken(
    enrollToken.hash,
    probeId,
    ENROLL_TOKEN_TTL_MINUTES,
  );
  return {
    enrollToken: enrollToken.token,
    installCommand: installCommand(enrollToken.token),
  };
}

probesRouter.post('/', async (request, response) => {
  const parsed = createSchema.safeParse(request.body);
  if (!parsed.success) {
    const collision = parsed.error.issues.some(
      (issue) =>
        (issue as { params?: { collision?: boolean } }).params?.collision,
    );
    response.status(collision ? 422 : 400).json({
      message: collision
        ? 'probe_id collides with a Railway region slug'
        : 'invalid probe',
      issues: parsed.error.issues,
    });
    return;
  }

  const asn = parsed.data.host ? await lookupAsn(parsed.data.host) : null;
  const probe = await createProbe({ ...parsed.data, asn });
  await recordEvent(probe.probeId, 'created');

  const enrollment = await issueEnrollment(probe.probeId);

  response.status(201).json({ probeId: probe.probeId, ...enrollment });
});

probesRouter.get('/', async (_request, response) => {
  const [probes, outcomes] = await Promise.all([
    listProbes(),
    listConvergeOutcomes(),
  ]);
  const outcomeByProbe = new Map(
    outcomes.map((outcome) => [outcome.probeId, outcome]),
  );
  response.status(200).json(
    probes.map((probe) => {
      const outcome = outcomeByProbe.get(probe.probeId);
      return serializeProbe(probe, {
        running: isRunning(probe.probeId),
        lastResult: outcome?.result ?? null,
        lastEventAt: outcome?.at ?? null,
      });
    }),
  );
});

const shaSchema = z.object({ sha: z.string().regex(/^[0-9a-f]{7,40}$/) });

probesRouter.post('/update-all', async (request, response) => {
  const parsed = shaSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: 'invalid sha' });
    return;
  }
  const tagCheck = await checkReleaseTag(parsed.data.sha);
  if (tagCheck === 'unavailable') {
    response.status(503).json({ message: 'could not verify release tag' });
    return;
  }
  if (tagCheck === 'absent') {
    response.status(422).json({ message: 'no such release tag' });
    return;
  }
  const probes = (await listProbes()).filter(
    (probe) =>
      ['enrolled', 'active'].includes(probe.status) &&
      !isRunning(probe.probeId),
  );

  for (const probe of probes) {
    fireConverge(
      {
        probeId: probe.probeId,
        playbook: 'converge',
        probeSha: parsed.data.sha,
      },
      'update-all',
    );
  }

  response.status(202).json({ probeIds: probes.map((probe) => probe.probeId) });
});

probesRouter.get('/:id/install', async (request, response) => {
  const probe = await getProbe(request.params.id);
  if (!probe) {
    response.status(404).json({ message: 'not found' });
    return;
  }
  response.status(200).json(await issueEnrollment(probe.probeId));
});

const eventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

probesRouter.get('/:id/events', async (request, response) => {
  const parsed = eventsQuerySchema.safeParse(request.query);
  if (!parsed.success) {
    response.status(400).json({ message: 'invalid query' });
    return;
  }
  response
    .status(200)
    .json(await listEvents(request.params.id, parsed.data.limit));
});

probesRouter.get('/:id', async (request, response) => {
  const probe = await getProbe(request.params.id);
  if (!probe) {
    response.status(404).json({ message: 'not found' });
    return;
  }
  response
    .status(200)
    .json(serializeProbe(probe, await convergeState(probe.probeId)));
});

probesRouter.patch(
  '/:id',
  validateMiddleware(patchSchema),
  async (request, response) => {
    const input = request.body as z.infer<typeof patchSchema>;
    const asn = input.host ? await lookupAsn(input.host) : undefined;
    const probe = await patchProbe(request.params.id, {
      ...input,
      ...(asn !== undefined ? { asn } : {}),
    });
    if (!probe) {
      response.status(404).json({ message: 'not found' });
      return;
    }
    response
      .status(200)
      .json(serializeProbe(probe, await convergeState(probe.probeId)));
  },
);

const STASH_TTL_MS = 10 * 60 * 1_000;

probesRouter.post('/:id/key/rotate', async (request, response) => {
  const probe = await getProbe(request.params.id);
  if (!probe) {
    response.status(404).json({ message: 'not found' });
    return;
  }
  const minted = mintApiKey(probe.probeId);
  const isRotation = probe.apiKeyHash !== null;

  await setProbeApiKey(probe.probeId, {
    hash: minted.hash,
    prefix: minted.prefix,
    rotate: isRotation,
  });
  secretStash.put(probe.probeId, { apiKey: minted.token }, STASH_TTL_MS);
  await recordEvent(probe.probeId, isRotation ? 'key_rotated' : 'key_minted');

  if (probe.deployedSha)
    fireConverge(
      {
        probeId: probe.probeId,
        playbook: 'converge',
        probeSha: probe.deployedSha,
      },
      'key/rotate',
    );

  response.status(200).json({ apiKey: minted.token });
});

probesRouter.post('/:id/key/revoke', async (request, response) => {
  const probe = await getProbe(request.params.id);
  if (!probe) {
    response.status(404).json({ message: 'not found' });
    return;
  }
  await revokeProbeKey(probe.probeId);
  await recordEvent(probe.probeId, 'key_revoked');

  response.status(200).json({ status: 'revoked' });
});

probesRouter.post('/:id/disable', async (request, response) => {
  const probe = await getProbe(request.params.id);
  if (!probe) {
    response.status(404).json({ message: 'not found' });
    return;
  }
  await disableProbe(probe.probeId);
  await recordEvent(probe.probeId, 'status_changed', { status: 'disabled' });

  response.status(200).json({ status: 'disabled' });
});

probesRouter.post('/:id/update', async (request, response) => {
  const probe = await getProbe(request.params.id);
  if (!probe) {
    response.status(404).json({ message: 'not found' });
    return;
  }
  const parsed = shaSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ message: 'invalid sha' });
    return;
  }
  const tagCheck = await checkReleaseTag(parsed.data.sha);
  if (tagCheck === 'unavailable') {
    response.status(503).json({ message: 'could not verify release tag' });
    return;
  }
  if (tagCheck === 'absent') {
    response.status(422).json({ message: 'no such release tag' });
    return;
  }
  fireConverge(
    {
      probeId: probe.probeId,
      playbook: 'converge',
      probeSha: parsed.data.sha,
    },
    'update',
  );

  response.status(202).json({ started: true });
});

probesRouter.delete('/:id', async (request, response) => {
  const probe = await getProbe(request.params.id);
  if (!probe) {
    response.status(404).json({ message: 'not found' });
    return;
  }

  const force = request.query.force === 'true';

  if (force) {
    await recordEvent(probe.probeId, 'force_deleted', {
      probeId: probe.probeId,
      note: 'teardown skipped; box may still trust fleet keys',
    });
    await deleteProbe(probe.probeId);
    response.status(204).end();
    return;
  }

  if (isRunning(probe.probeId)) {
    response
      .status(409)
      .json({ message: 'a play is already running for this probe' });
    return;
  }

  const tornDown = await runPlaybook({
    probeId: probe.probeId,
    playbook: 'teardown',
  });
  if (!tornDown) {
    response.status(502).json({
      message: 'teardown failed; probe not deleted (retry or ?force=true)',
    });
    return;
  }

  await recordEvent(probe.probeId, 'deleted', {});
  await deleteProbe(probe.probeId);

  response.status(204).end();
});

export default probesRouter;
