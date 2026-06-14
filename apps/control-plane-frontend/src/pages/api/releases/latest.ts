import { getLatestRelease } from '@/lib/api';
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

  return proxy(res, () => getLatestRelease());
}
