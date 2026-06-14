import { deleteAdminKey } from '@/lib/api';
import { methodNotAllowed, proxy } from '@/lib/apiHandler';

import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<void> {
  const id = req.query.id as string;

  if (req.method !== 'DELETE') {
    methodNotAllowed(res, ['DELETE']);
    return Promise.resolve();
  }

  return proxy(res, () => deleteAdminKey(id));
}
