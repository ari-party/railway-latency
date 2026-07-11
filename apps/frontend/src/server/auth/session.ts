import { SignJWT, jwtVerify } from 'jose';

import { env } from '@/env';

export interface SessionUser {
  email: string;
  name?: string;
  picture?: string;
}

export const SESSION_COOKIE_NAME = 'session';

export const OAUTH_FLOW_COOKIE_NAME = 'oauth_flow';

export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

function sessionSecretKey(): Uint8Array {
  if (!env.AUTH_SESSION_SECRET)
    throw new Error('AUTH_SESSION_SECRET is not set');

  return new TextEncoder().encode(env.AUTH_SESSION_SECRET);
}

export async function signSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({
    email: user.email,
    name: user.name,
    picture: user.picture,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(sessionSecretKey());
}

export async function verifySessionToken(
  token: string | undefined,
): Promise<SessionUser | null> {
  if (!token || !env.AUTH_SESSION_SECRET) return null;

  try {
    const { payload } = await jwtVerify(token, sessionSecretKey(), {
      algorithms: ['HS256'],
    });
    if (typeof payload.email !== 'string') return null;

    return {
      email: payload.email,
      name: typeof payload.name === 'string' ? payload.name : undefined,
      picture:
        typeof payload.picture === 'string' ? payload.picture : undefined,
    };
  } catch {
    return null;
  }
}

export function matchesAllowlist(email: string, allowlist: string[]): boolean {
  const normalizedEmail = email.toLowerCase();

  return allowlist.some((entry) => {
    const normalizedEntry = entry.trim().toLowerCase();
    if (!normalizedEntry) return false;

    if (normalizedEntry.startsWith('*@'))
      return normalizedEmail.endsWith(normalizedEntry.slice(1));

    return normalizedEmail === normalizedEntry;
  });
}

export function isEmailAllowed(email: string): boolean {
  const allowedEmails = env.AUTH_ALLOWED_EMAILS;
  if (!allowedEmails) return false;

  return matchesAllowlist(email, allowedEmails.split(','));
}

export function serializeCookie(
  name: string,
  value: string,
  maxAgeSeconds: number,
): string {
  const attributes = [
    `${name}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (env.NODE_ENV === 'production') attributes.push('Secure');

  return attributes.join('; ');
}
