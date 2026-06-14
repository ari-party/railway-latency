import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { recordEvent } from '@/db/events';
import { markActiveIfEnrolled, setDeployedSha } from '@/db/probes';
import { env } from '@/env';
import { log } from '@/pino';
import { renderGroupVars } from '@/services/renderGroupVars';
import { secretStash } from '@/services/secretStash';

export type PlaybookKind = 'converge' | 'teardown';

export interface RunOptions {
  probeId: string;
  playbook: PlaybookKind;
  probeSha?: string;
}

export type Spawner = typeof spawn;

export const ANSIBLE_ROOT = join(process.cwd(), 'ansible');
const INVENTORY_SCRIPT = join(ANSIBLE_ROOT, 'inventory', 'registry.py');
export const GROUP_VARS_FILE = join(ANSIBLE_ROOT, 'group_vars', 'all.yml');
const PLAYBOOKS: Record<PlaybookKind, string> = {
  converge: join(ANSIBLE_ROOT, 'playbooks', 'converge.yml'),
  teardown: join(ANSIBLE_ROOT, 'playbooks', 'teardown.yml'),
};
const FLEET_KEY_DIR_PREFIX = '/dev/shm/fleet-';

const running = new Set<string>();

export function buildArgs(options: RunOptions): string[] {
  const args = [
    '-i',
    INVENTORY_SCRIPT,
    // Ansible never auto-loads group_vars/all.yml from here, so pass it explicitly.
    '-e',
    `@${GROUP_VARS_FILE}`,
    '--limit',
    options.probeId,
    PLAYBOOKS[options.playbook],
  ];
  if (options.probeSha) args.push('-e', `probe_sha=${options.probeSha}`);

  return args;
}

export async function runPlaybook(
  options: RunOptions,
  spawner: Spawner = spawn,
): Promise<boolean> {
  if (running.has(options.probeId))
    throw new Error(`a play is already running for ${options.probeId}`);
  running.add(options.probeId);

  try {
    await recordEvent(options.probeId, 'ansible_started', {
      playbook: options.playbook,
      ...(options.probeSha ? { probeSha: options.probeSha } : {}),
    });

    await renderGroupVars();

    const keyDir = mkdtempSync(FLEET_KEY_DIR_PREFIX);
    const privateKeyPath = join(keyDir, 'fleet_ed25519');
    writeFileSync(
      privateKeyPath,
      Buffer.from(env.AUTOMATION_SSH_KEY_B64, 'base64'),
      { mode: 0o600 },
    );

    const child = spawner('ansible-playbook', buildArgs(options), {
      cwd: ANSIBLE_ROOT,
      env: {
        ...process.env,
        CONTROL_PLANE_INVENTORY_URL: `http://127.0.0.1:${env.PORT}/internal/inventory`,
        CONTROL_PLANE_INTERNAL_TOKEN: env.CONTROL_PLANE_INTERNAL_TOKEN,
        ANSIBLE_HOST_KEY_CHECKING: 'True',
        ANSIBLE_PRIVATE_KEY_FILE: privateKeyPath,
        ANSIBLE_SSH_ARGS:
          '-o StrictHostKeyChecking=accept-new -o ControlMaster=auto -o ControlPersist=60s',
      },
    });

    let logTail = '';
    const captureTail = (chunk: Buffer) => {
      logTail = (logTail + chunk.toString()).slice(-8192);
    };

    child.stdout?.on('data', captureTail);
    child.stderr?.on('data', captureTail);

    return await new Promise<boolean>((resolve) => {
      // 'error' and 'close' can both fire; handle whichever comes first exactly once. An unhandled 'error' crashes the process.
      let handled = false;

      const cleanupAndResolve = (succeeded: boolean) => {
        rmSync(keyDir, { recursive: true, force: true });
        resolve(succeeded);
      };

      child.on('error', (error) => {
        if (handled) return;
        handled = true;
        void (async () => {
          await recordEvent(options.probeId, 'ansible_failed', {
            reason: error instanceof Error ? error.message : String(error),
            tail: logTail,
          });
          log.error(
            { probeId: options.probeId, err: error },
            'ansible spawn failed',
          );
          cleanupAndResolve(false);
        })();
      });

      child.on('close', (code) => {
        if (handled) return;
        handled = true;
        void (async () => {
          if (code === 0) {
            // Only drop the key on success; on failure a retry still needs it (the TTL bounds the leak).
            secretStash.drop(options.probeId);
            // No tail on the success path: it could carry secret task output that must not be stored durably.
            await recordEvent(options.probeId, 'ansible_ok');
            if (options.probeSha) {
              await setDeployedSha(options.probeId, options.probeSha);
              await markActiveIfEnrolled(options.probeId);
            }
          } else {
            await recordEvent(options.probeId, 'ansible_failed', {
              code,
              tail: logTail,
            });
            log.error(
              { probeId: options.probeId, code, tail: logTail },
              'ansible run failed',
            );
          }
          cleanupAndResolve(code === 0);
        })();
      });
    });
  } finally {
    running.delete(options.probeId);
  }
}

export function isRunning(probeId: string): boolean {
  return running.has(probeId);
}

export function fireConverge(options: RunOptions, context: string): void {
  void runPlaybook(options).catch(async (error: unknown) => {
    const reason = error instanceof Error ? error.message : String(error);
    log.error(
      { probeId: options.probeId, context, err: error },
      'converge rejected',
    );
    try {
      await recordEvent(options.probeId, 'converge_failed', {
        reason,
        context,
      });
    } catch (recordError) {
      log.error(
        { probeId: options.probeId, err: recordError },
        'failed to record converge_failed event',
      );
    }
  });
}
