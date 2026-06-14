import { timingSafeEqual } from 'node:crypto';

import { env } from '@/env';

import type { NextFunction, Request, Response } from 'express';

export function requireInternalToken(
  request: Request,
  response: Response,
  next: NextFunction,
) {
  const presented = request.get('x-internal-token');
  if (!presented) return response.status(401).json({ message: 'unauthorized' });

  const presentedBuffer = Buffer.from(presented);
  const expectedBuffer = Buffer.from(env.CONTROL_PLANE_INTERNAL_TOKEN);

  if (
    presentedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(presentedBuffer, expectedBuffer)
  )
    return response.status(401).json({ message: 'unauthorized' });

  return next();
}
