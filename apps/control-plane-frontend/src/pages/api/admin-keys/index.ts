import { createAdminKey, listAdminKeys } from '@/lib/api';
import { methodNotAllowed, proxy } from '@/lib/apiHandler';

import type { CreateAdminKeyInput } from '@railway-latency/types';
import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<void> {
  switch (req.method) {
    case 'GET':
      return proxy(res, () => listAdminKeys());
    case 'POST':
      return proxy(res, () => createAdminKey(req.body as CreateAdminKeyInput));
    default:
      methodNotAllowed(res, ['GET', 'POST']);
      return Promise.resolve();
  }
}
