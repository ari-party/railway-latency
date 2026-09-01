import { methodNotAllowed } from '@/lib/apiHandler';

import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse,
): void {
  if (req.method !== 'GET') {
    methodNotAllowed(res, ['GET']);
    return;
  }

  res.status(200).json({ status: 'ok' });
}
