import { env } from '@/env';

import type { SessionUser } from '@/server/auth/session';

const OAUTH_ISSUER = 'https://backboard.railway.com';

const OAUTH_AUTHORIZATION_ENDPOINT = `${OAUTH_ISSUER}/oauth/auth`;

const OAUTH_TOKEN_ENDPOINT = `${OAUTH_ISSUER}/oauth/token`;

const OAUTH_USERINFO_ENDPOINT = `${OAUTH_ISSUER}/oauth/me`;

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

export async function exchangeCodeForAccessToken(
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

  const { access_token: accessToken } = (await response.json()) as {
    access_token?: string;
  };
  if (!accessToken) throw new Error('token response missing access_token');

  return accessToken;
}

export async function fetchOauthUser(
  accessToken: string,
): Promise<SessionUser> {
  const response = await fetch(OAUTH_USERINFO_ENDPOINT, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok)
    throw new Error(`userinfo request failed with status ${response.status}`);

  const profile = (await response.json()) as {
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };
  if (typeof profile.email !== 'string' || profile.email_verified === false) {
    console.error('userinfo response:', JSON.stringify(profile));
    throw new Error('userinfo missing a verified email');
  }

  return {
    email: profile.email,
    name: typeof profile.name === 'string' ? profile.name : undefined,
    picture: typeof profile.picture === 'string' ? profile.picture : undefined,
  };
}
