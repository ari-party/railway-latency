import { createHash, timingSafeEqual } from 'node:crypto';

import type { RosterCache } from '@/services/roster';
import type { NextFunction, Request, Response } from 'express';

export function apiKeyPrefix(token: string): string {
  const lastUnderscore = token.lastIndexOf('_');
  if (lastUnderscore < 0) return token;

  const head = token.slice(0, lastUnderscore + 1);
  const random = token.slice(lastUnderscore + 1);

  return head + random.slice(0, 8);
}

export function requireProbeAuth(roster: RosterCache) {
  return async function probeAuth(
    request: Request,
    response: Response,
    next: NextFunction,
  ) {
    const token = request
      .get('authorization')
      ?.replace(/^bearer\s+/i, '')
      .trim();
    if (!token) return response.status(401).json({ message: 'missing token' });

    const resolution = await roster.resolve(apiKeyPrefix(token));

    if ('unavailable' in resolution)
      return response.status(503).json({ message: 'roster unavailable' });

    if ('unknown' in resolution)
      return response.status(401).json({ message: 'unknown probe' });

    const { probe } = resolution;
    const presented = createHash('sha256').update(token).digest();

    const matches = (hex?: string) => {
      if (!hex) return false;
      const expected = Buffer.from(hex, 'hex');
      return (
        presented.length === expected.length &&
        timingSafeEqual(presented, expected)
      );
    };

    if (!matches(probe.apiKeyHash) && !matches(probe.previousApiKeyHash))
      return response.status(401).json({ message: 'bad token' });

    if (probe.status === 'revoked')
      return response.status(401).json({ message: 'revoked' });
    if (probe.status === 'disabled')
      return response.status(403).json({ message: 'disabled' });

    request.probe = probe;

    return next();
  };
}
