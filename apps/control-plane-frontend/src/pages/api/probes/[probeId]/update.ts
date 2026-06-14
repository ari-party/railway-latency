import { updateProbe } from '@/lib/api';
import { methodNotAllowed, proxy } from '@/lib/apiHandler';

import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<void> {
  const probeId = req.query.probeId as string;

  if (req.method !== 'POST') {
    methodNotAllowed(res, ['POST']);
    return Promise.resolve();
  }

  return proxy(res, () => {
    const { sha } = req.body as { sha: string };
    return updateProbe(probeId, sha);
  });
}
