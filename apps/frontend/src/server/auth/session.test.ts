import { describe, expect, it, vi } from 'vitest';

vi.mock('@/env', () => ({
  env: {
    NODE_ENV: 'test',
    AUTH_SESSION_SECRET: 'test-secret',
    AUTH_ALLOWED_EMAILS: 'ops@example.com, *@corp.tld',
  },
}));

import {
  isEmailAllowed,
  matchesAllowlist,
  signSessionToken,
  verifySessionToken,
} from '@/server/auth/session';

describe('matchesAllowlist', () => {
  it('matches an exact email case-insensitively', () => {
    expect(matchesAllowlist('Ops@Example.com', ['ops@example.com'])).toBe(true);
  });

  it('matches a wildcard domain entry', () => {
    expect(matchesAllowlist('anyone@corp.tld', ['*@corp.tld'])).toBe(true);
    expect(matchesAllowlist('Anyone@CORP.TLD', ['*@corp.tld'])).toBe(true);
  });

  it('does not match a wildcard against a different or nested domain', () => {
    expect(matchesAllowlist('anyone@other.tld', ['*@corp.tld'])).toBe(false);
    expect(matchesAllowlist('anyone@corp.tld.evil.com', ['*@corp.tld'])).toBe(
      false,
    );
  });

  it('ignores empty entries and whitespace around entries', () => {
    expect(matchesAllowlist('ops@example.com', ['', ' ops@example.com '])).toBe(
      true,
    );
    expect(matchesAllowlist('ops@example.com', ['', ' '])).toBe(false);
  });

  it('does not match an unlisted email', () => {
    expect(matchesAllowlist('stranger@example.com', ['ops@example.com'])).toBe(
      false,
    );
  });
});

describe('isEmailAllowed', () => {
  it('reads the comma-separated allowlist from the environment', () => {
    expect(isEmailAllowed('ops@example.com')).toBe(true);
    expect(isEmailAllowed('anyone@corp.tld')).toBe(true);
    expect(isEmailAllowed('stranger@example.com')).toBe(false);
  });
});

describe('session tokens', () => {
  it('round-trips a user through sign and verify', async () => {
    const token = await signSessionToken({
      email: 'ops@example.com',
      name: 'Ops',
      picture: 'https://example.com/avatar.png',
    });

    expect(await verifySessionToken(token)).toEqual({
      email: 'ops@example.com',
      name: 'Ops',
      picture: 'https://example.com/avatar.png',
    });
  });

  it('omits name and picture when they were not set', async () => {
    const token = await signSessionToken({ email: 'ops@example.com' });

    expect(await verifySessionToken(token)).toEqual({
      email: 'ops@example.com',
      name: undefined,
      picture: undefined,
    });
  });

  it('returns null for a missing, garbage, or tampered token', async () => {
    expect(await verifySessionToken(undefined)).toBeNull();
    expect(await verifySessionToken('not-a-jwt')).toBeNull();

    const token = await signSessionToken({ email: 'ops@example.com' });
    expect(await verifySessionToken(`${token}x`)).toBeNull();
  });
});
