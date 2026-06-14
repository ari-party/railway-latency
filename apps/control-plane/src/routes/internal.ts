import { Router } from 'express';
import { z } from 'zod';

import { query } from '@/db/pool';
import { advanceLastSeen, getMapRoster, getRoster } from '@/db/probes';
import { validateMiddleware } from '@/middleware/validate';
import { secretStash } from '@/services/secretStash';

const internalRouter = Router();

internalRouter.get('/roster', async (_request, response) => {
  response.status(200).json(await getRoster());
});

internalRouter.get('/map-roster', async (_request, response) => {
  response.status(200).json(await getMapRoster());
});

interface InventoryProbeRow {
  probe_id: string;
  host: string;
  deployed_sha: string | null;
  lat: number;
  lon: number;
}

internalRouter.get('/inventory', async (_request, response) => {
  const result = await query<InventoryProbeRow>(
    `select probe_id, host, deployed_sha, lat, lon
     from probes
     where status in ('enrolled', 'active')`,
  );

  const hosts = result.rows.map((probe) => probe.probe_id);

  const hostvars: Record<string, unknown> = {};

  for (const probe of result.rows) {
    const stashed = secretStash.get(probe.probe_id);
    hostvars[probe.probe_id] = {
      ansible_host: probe.host,
      probe_id: probe.probe_id,
      probe_sha: probe.deployed_sha,
      lat: probe.lat,
      lon: probe.lon,
      ...(stashed ? { probe_api_key: stashed.apiKey } : {}),
    };
  }

  response.status(200).json({ probes: { hosts }, _meta: { hostvars } });
});

const seenSchema = z.array(
  z.object({
    probeId: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    ts: z.number().int().positive(),
  }),
);

internalRouter.post(
  '/seen',
  validateMiddleware(seenSchema),
  async (request, response) => {
    await advanceLastSeen(request.body as z.infer<typeof seenSchema>);
    response.status(204).end();
  },
);

export default internalRouter;
