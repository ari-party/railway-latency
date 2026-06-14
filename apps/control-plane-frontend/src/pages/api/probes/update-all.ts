import { updateAllProbes } from '@/lib/api';
import { methodNotAllowed, proxy } from '@/lib/apiHandler';

import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<void> {
  if (req.method !== 'POST') {
    methodNotAllowed(res, ['POST']);
    return Promise.resolve();
  }

  return proxy(res, () => {
    const { sha } = req.body as { sha: string };
    return updateAllProbes(sha);
  });
}
