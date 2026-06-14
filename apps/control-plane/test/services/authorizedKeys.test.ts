import { describe, expect, it } from 'vitest';

import { renderAuthorizedKeys } from '@/services/authorizedKeys';

describe('renderAuthorizedKeys', () => {
  it('renders admin + automation as exact desired-state', () => {
    const text = renderAuthorizedKeys(
      ['ssh-ed25519 AAAA admin1', '  ', 'ssh-ed25519 AAAA admin2'],
      'ssh-ed25519 AAAAtest automation',
    );
    expect(text).toBe(
      'ssh-ed25519 AAAA admin1\n' +
        'ssh-ed25519 AAAA admin2\n' +
        'ssh-ed25519 AAAAtest automation\n',
    );
  });
});
