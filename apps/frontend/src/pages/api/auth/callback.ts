import {
  exchangeCodeForAccessToken,
  fetchOauthUser,
  isAuthEnabled,
} from '@/server/auth/oauth';
import {
  OAUTH_FLOW_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  serializeCookie,
  signSessionToken,
} from '@/server/auth/session';

import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (!isAuthEnabled()) return res.status(404).end();

  const clearFlowCookie = serializeCookie(OAUTH_FLOW_COOKIE_NAME, '', 0);

  try {
    const { code, state } = req.query;
    const [expectedState, codeVerifier] = (
      req.cookies[OAUTH_FLOW_COOKIE_NAME] ?? ''
    ).split('.');
    if (
      typeof code !== 'string' ||
      typeof state !== 'string' ||
      !expectedState ||
      !codeVerifier ||
      state !== expectedState
    )
      throw new Error('oauth state mismatch');

    const accessToken = await exchangeCodeForAccessToken(code, codeVerifier);
    const user = await fetchOauthUser(accessToken);
    const sessionToken = await signSessionToken(user);

    res.setHeader('Set-Cookie', [
      clearFlowCookie,
      serializeCookie(
        SESSION_COOKIE_NAME,
        sessionToken,
        SESSION_MAX_AGE_SECONDS,
      ),
    ]);
  } catch (error) {
    console.error('oauth callback failed:', error);
    res.setHeader('Set-Cookie', clearFlowCookie);
  }

  res.redirect('/');
}
