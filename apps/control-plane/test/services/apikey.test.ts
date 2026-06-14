import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { mintApiKey, mintEnrollmentToken, sha256 } from '@/services/apikey';

describe('apikey service', () => {
  it('mints rl_<probeId>_<random> with matching hash and prefix', () => {
    const { token, hash, prefix } = mintApiKey('asia-hcloud-sin1');
    expect(token).toMatch(/^rl_asia-hcloud-sin1_[a-f0-9]{32}$/);
    expect(prefix).toBe(
      `rl_asia-hcloud-sin1_${token.split('_')[2].slice(0, 8)}`,
    );
    expect(token.startsWith(prefix)).toBe(true);
    expect(
      Buffer.from(hash).equals(createHash('sha256').update(token).digest()),
    ).toBe(true);
  });

  it('mints a distinct enrollment token each call', () => {
    const first = mintEnrollmentToken();
    const second = mintEnrollmentToken();
    expect(first.token).not.toBe(second.token);
    expect(first.token).toMatch(/^et_[A-Za-z0-9_-]+$/);
    expect(Buffer.from(first.hash).equals(sha256(first.token))).toBe(true);
  });
});
