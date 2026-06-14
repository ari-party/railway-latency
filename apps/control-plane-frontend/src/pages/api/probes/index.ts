import { createProbe, listProbes } from '@/lib/api';
import { methodNotAllowed, proxy } from '@/lib/apiHandler';

import type { CreateProbeInput } from '@railway-latency/types';
import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<void> {
  switch (req.method) {
    case 'GET':
      return proxy(res, () => listProbes());
    case 'POST':
      return proxy(res, () => createProbe(req.body as CreateProbeInput));
    default:
      methodNotAllowed(res, ['GET', 'POST']);
      return Promise.resolve();
  }
}
