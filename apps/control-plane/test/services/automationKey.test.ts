import '../helpers/db';

import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { derivePublicKeyFromPrivateKey } from '@/services/automationKey';

const FIXTURE_PRIVATE_KEY_BASE64 =
  'LS0tLS1CRUdJTiBPUEVOU1NIIFBSSVZBVEUgS0VZLS0tLS0KYjNCbGJuTnphQzFyWlhrdGRqRUFBQUFBQkc1dmJtVUFBQUFFYm05dVpRQUFBQUFBQUFBQkFBQUFNd0FBQUF0emMyZ3RaVwpReU5UVXhPUUFBQUNBY1doVGlHUUp1NFkwR3YrZ01VcVhnMUVNTjZWQ1E0SzJOODluTWdQMlpmQUFBQUtDc1RHaUFyRXhvCmdBQUFBQXR6YzJndFpXUXlOVFV4T1FBQUFDQWNXaFRpR1FKdTRZMEd2K2dNVXFYZzFFTU42VkNRNEsyTjg5bk1nUDJaZkEKQUFBRUR6dHExUXl5Q2hScFVLdzM5OVhibHZ2T1NqYVhrTHdQZFptVk1QWDNKTFV4eGFGT0laQW03aGpRYS82QXhTcGVEVQpRdzNwVUpEZ3JZM3oyY3lBL1psOEFBQUFIV1pzWldWMExXRjFkRzl0WVhScGIyNHRkR1Z6ZEMxbWFYaDBkWEpsCi0tLS0tRU5EIE9QRU5TU0ggUFJJVkFURSBLRVktLS0tLQo=';
const FIXTURE_PUBLIC_KEY =
  'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIBxaFOIZAm7hjQa/6AxSpeDUQw3pUJDgrY3z2cyA/Zl8 fleet-automation-test-fixture';

const temporaryDirectory = mkdtempSync(join(tmpdir(), 'automation-key-'));

describe('derivePublicKeyFromPrivateKey', () => {
  afterAll(() => {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  it('derives the OpenSSH public key line from the base64 private key', async () => {
    const publicKey = await derivePublicKeyFromPrivateKey(
      FIXTURE_PRIVATE_KEY_BASE64,
      temporaryDirectory,
    );
    expect(publicKey).toBe(FIXTURE_PUBLIC_KEY);
  });

  it('removes the materialized private key after derivation', async () => {
    await derivePublicKeyFromPrivateKey(
      FIXTURE_PRIVATE_KEY_BASE64,
      temporaryDirectory,
    );
    expect(readdirSync(temporaryDirectory)).toEqual([]);
  });

  it('removes the materialized key and throws clearly on invalid key material', async () => {
    const garbageBase64 = Buffer.from('not an ssh private key').toString(
      'base64',
    );
    await expect(
      derivePublicKeyFromPrivateKey(garbageBase64, temporaryDirectory),
    ).rejects.toThrow(/failed to derive the automation public key/);
    expect(readdirSync(temporaryDirectory)).toEqual([]);
  });
});
