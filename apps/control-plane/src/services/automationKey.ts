import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { env } from '@/env';

const execFileAsync = promisify(execFile);

const RUNTIME_MATERIALIZATION_DIRECTORY = '/dev/shm';

export async function derivePublicKeyFromPrivateKey(
  privateKeyBase64: string,
  materializationDirectory: string,
): Promise<string> {
  // Fresh per-call temp dir: an unpredictable path stops a pre-planted symlink from redirecting the 0600 write.
  const keyDir = mkdtempSync(join(materializationDirectory, 'fleet-'));
  const privateKeyPath = join(keyDir, 'fleet_ed25519_derivation');
  writeFileSync(privateKeyPath, Buffer.from(privateKeyBase64, 'base64'), {
    mode: 0o600,
  });

  try {
    const { stdout } = await execFileAsync('ssh-keygen', [
      '-y',
      '-f',
      privateKeyPath,
    ]);
    return stdout.trim();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `failed to derive the automation public key from AUTOMATION_SSH_KEY_B64: ${detail}`,
    );
  } finally {
    rmSync(keyDir, { recursive: true, force: true });
  }
}

let cachedAutomationPublicKey: string | undefined;

export async function getAutomationPublicKey(): Promise<string> {
  cachedAutomationPublicKey ??= await derivePublicKeyFromPrivateKey(
    env.AUTOMATION_SSH_KEY_B64,
    RUNTIME_MATERIALIZATION_DIRECTORY,
  );
  return cachedAutomationPublicKey;
}
