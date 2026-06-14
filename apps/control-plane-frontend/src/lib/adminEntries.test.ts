import { describe, expect, it } from 'vitest';

import { isSshPublicKey, validateAdminKeyForm } from '@/lib/adminEntries';

describe('isSshPublicKey', () => {
  it('accepts ed25519, rsa and ecdsa keys with the AAAA base64 body', () => {
    expect(
      isSshPublicKey('ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIabc123+/ ops@host'),
    ).toBe(true);
    expect(isSshPublicKey('ssh-rsa AAAAB3NzaC1yc2EAAAAD/q+0=')).toBe(true);
    expect(
      isSshPublicKey('ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlz='),
    ).toBe(true);
  });

  it('tolerates surrounding whitespace and a missing comment', () => {
    expect(isSshPublicKey('  ssh-ed25519 AAAAC3NzaC1lZDI1NTE5  ')).toBe(true);
  });

  it('rejects non-key strings and the wrong body marker', () => {
    expect(isSshPublicKey('')).toBe(false);
    expect(isSshPublicKey('not-a-key')).toBe(false);
    expect(isSshPublicKey('ssh-ed25519 BBBBnotbase64')).toBe(false);
    expect(isSshPublicKey('ssh-dss AAAAB3NzaC1kc3M=')).toBe(false);
  });
});

describe('validateAdminKeyForm', () => {
  it('passes a complete valid form', () => {
    expect(
      validateAdminKeyForm({
        label: 'ops laptop',
        publicKey: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIabc ops@host',
      }),
    ).toEqual({});
  });

  it('reports a missing label and a malformed key independently', () => {
    const errors = validateAdminKeyForm({ label: '  ', publicKey: 'nope' });
    expect(errors.label).toBeDefined();
    expect(errors.publicKey).toBeDefined();
  });
});
