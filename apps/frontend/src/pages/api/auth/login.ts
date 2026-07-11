import { createHash, randomBytes } from 'node:crypto';

import { buildAuthorizationUrl } from '@/server/auth/oauth';
import { OAUTH_FLOW_COOKIE_NAME, serializeCookie } from '@/server/auth/session';

import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  const state = randomBytes(16).toString('base64url');
  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  res.setHeader(
    'Set-Cookie',
    serializeCookie(
      OAUTH_FLOW_COOKIE_NAME,
      `${state}.${codeVerifier}`,
      10 * 60,
    ),
  );
  res.redirect(buildAuthorizationUrl(state, codeChallenge));
}
