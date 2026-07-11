import { createRemoteJWKSet, jwtVerify } from 'jose';

import { env } from '@/env';

import type { SessionUser } from '@/server/auth/session';

const OAUTH_ISSUER = 'https://backboard.railway.com';

const OAUTH_AUTHORIZATION_ENDPOINT = `${OAUTH_ISSUER}/oauth/auth`;

const OAUTH_TOKEN_ENDPOINT = `${OAUTH_ISSUER}/oauth/token`;

const remoteJwks = createRemoteJWKSet(new URL(`${OAUTH_ISSUER}/oauth/jwks`));

export function isAuthEnabled() {
  return Boolean(
    env.APP_URL &&
      env.RAILWAY_OAUTH_CLIENT_ID &&
      env.RAILWAY_OAUTH_CLIENT_SECRET &&
      env.AUTH_SESSION_SECRET,
  );
}

function requireOauthEnv() {
  const {
    APP_URL: appUrl,
    RAILWAY_OAUTH_CLIENT_ID: clientId,
    RAILWAY_OAUTH_CLIENT_SECRET: clientSecret,
  } = env;
  if (!appUrl || !clientId || !clientSecret)
    throw new Error('oauth env vars are not set');

  return { appUrl, clientId, clientSecret };
}

export function buildAuthorizationUrl(
  state: string,
  codeChallenge: string,
): string {
  const { appUrl, clientId } = requireOauthEnv();

  const url = new URL(OAUTH_AUTHORIZATION_ENDPOINT);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', `${appUrl}/api/auth/callback`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');

  return url.toString();
}

export async function exchangeCodeForIdToken(
  code: string,
  codeVerifier: string,
): Promise<string> {
  const { appUrl, clientId, clientSecret } = requireOauthEnv();

  const response = await fetch(OAUTH_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${appUrl}/api/auth/callback`,
      client_id: clientId,
      client_secret: clientSecret,
      code_verifier: codeVerifier,
    }),
  });
  if (!response.ok)
    throw new Error(`token exchange failed with status ${response.status}`);

  const { id_token: idToken } = (await response.json()) as {
    id_token?: string;
  };
  if (!idToken) throw new Error('token response missing id_token');

  return idToken;
}

export async function verifyIdToken(idToken: string): Promise<SessionUser> {
  const { clientId } = requireOauthEnv();

  const { payload } = await jwtVerify(idToken, remoteJwks, {
    issuer: OAUTH_ISSUER,
    audience: clientId,
  });

  if (typeof payload.email !== 'string' || payload.email_verified !== true)
    throw new Error('id token missing a verified email');

  return {
    email: payload.email,
    name: typeof payload.name === 'string' ? payload.name : undefined,
    picture: typeof payload.picture === 'string' ? payload.picture : undefined,
  };
}
