import { listProbeEvents } from '@/lib/api';
import { methodNotAllowed, proxy } from '@/lib/apiHandler';

import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<void> {
  if (req.method !== 'GET') {
    methodNotAllowed(res, ['GET']);
    return Promise.resolve();
  }

  const probeId = req.query.probeId as string;
  const limit =
    typeof req.query.limit === 'string' ? req.query.limit : undefined;
  return proxy(res, () => listProbeEvents(probeId, limit));
}
