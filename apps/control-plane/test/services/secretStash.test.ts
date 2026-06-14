import { describe, expect, it } from 'vitest';

import { secretStash } from '@/services/secretStash';

describe('secretStash', () => {
  it('stashes and retrieves a transient entry then drops it', () => {
    secretStash.put('europe-ovh-fra1', { apiKey: 'rl_x' }, 10 * 1_000);
    expect(secretStash.get('europe-ovh-fra1')).toEqual({ apiKey: 'rl_x' });
    secretStash.drop('europe-ovh-fra1');
    expect(secretStash.get('europe-ovh-fra1')).toBeUndefined();
  });

  it('expires an entry past its ttl', () => {
    secretStash.put('asia-hcloud-sin1', { apiKey: 'rl_y' }, -1);
    expect(secretStash.get('asia-hcloud-sin1')).toBeUndefined();
  });
});
