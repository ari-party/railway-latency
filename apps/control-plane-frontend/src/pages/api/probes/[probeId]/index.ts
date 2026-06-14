import { deleteProbe, getProbe, patchProbe } from '@/lib/api';
import { methodNotAllowed, proxy } from '@/lib/apiHandler';

import type { PatchProbeInput } from '@railway-latency/types';
import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<void> {
  const probeId = req.query.probeId as string;

  switch (req.method) {
    case 'GET':
      return proxy(res, () => getProbe(probeId));
    case 'PATCH':
      return proxy(res, () => patchProbe(probeId, req.body as PatchProbeInput));
    case 'DELETE': {
      const force = req.query.force === 'true';
      return proxy(res, () => deleteProbe(probeId, { force }));
    }
    default:
      methodNotAllowed(res, ['GET', 'PATCH', 'DELETE']);
      return Promise.resolve();
  }
}
