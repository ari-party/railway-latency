import { ApiError } from '@/lib/api';

import type { ApiResponse } from '@/lib/api';
import type { HttpMethod } from '@/lib/http';
import type { NextApiResponse } from 'next';

export async function proxy<TResult>(
  res: NextApiResponse,
  call: () => Promise<ApiResponse<TResult>>,
): Promise<void> {
  try {
    const { data, status } = await call();
    if (data === undefined) {
      res.status(status).end();
      return;
    }
    res.status(status).json(data);
  } catch (error) {
    if (error instanceof ApiError) {
      res
        .status(error.status)
        .json({ message: error.message, body: error.body });
      return;
    }
    const message =
      error instanceof Error ? error.message : 'control-plane unreachable';
    res.status(502).json({ message });
  }
}

export function methodNotAllowed(
  res: NextApiResponse,
  allowed: readonly HttpMethod[],
): void {
  res.setHeader('Allow', allowed.join(', '));
  res.status(405).json({ message: 'method not allowed' });
}
