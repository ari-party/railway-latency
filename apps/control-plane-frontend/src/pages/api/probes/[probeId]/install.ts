import { getProbeInstall } from '@/lib/api';
import { methodNotAllowed, proxy } from '@/lib/apiHandler';

import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<void> {
  const probeId = req.query.probeId as string;

  if (req.method !== 'GET') {
    methodNotAllowed(res, ['GET']);
    return Promise.resolve();
  }

  return proxy(res, () => getProbeInstall(probeId));
}
