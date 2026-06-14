import '../helpers/db';

import { EventEmitter } from 'node:events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { spawn } from 'node:child_process';

vi.mock('node:fs', () => ({
  mkdtempSync: vi.fn(() => '/tmp/fleet-test'),
  writeFileSync: vi.fn(),
  rmSync: vi.fn(),
}));
vi.mock('@/db/events', () => ({ recordEvent: vi.fn(async () => undefined) }));
vi.mock('@/db/probes', () => ({
  markActiveIfEnrolled: vi.fn(async () => undefined),
  setDeployedSha: vi.fn(async () => undefined),
}));
vi.mock('@/services/renderGroupVars', () => ({
  renderGroupVars: vi.fn(async () => undefined),
}));

import { recordEvent } from '@/db/events';
import { fireConverge, runPlaybook } from '@/services/ansible';
import { secretStash } from '@/services/secretStash';

class FakeChild extends EventEmitter {
  stdout = new EventEmitter();

  stderr = new EventEmitter();
}

function spawnerThatExitsWith(code: number) {
  const child = new FakeChild();
  const spawner = vi.fn(() => {
    queueMicrotask(() => child.emit('close', code));
    return child;
  });
  return spawner as unknown as typeof spawn;
}

function spawnerThatStaysOpen() {
  const child = new FakeChild();
  const spawner = vi.fn(() => child);
  return {
    spawner: spawner as unknown as typeof spawn,
    finish: (code: number) => child.emit('close', code),
  };
}

function spawnerThatErrorsWith(error: Error) {
  const child = new FakeChild();
  const spawner = vi.fn(() => {
    queueMicrotask(() => child.emit('error', error));
    return child;
  });
  return spawner as unknown as typeof spawn;
}

const PROBE_ID = 'europe-ovh-fra1';

describe('runPlaybook secret stash lifecycle', () => {
  beforeEach(() => {
    secretStash.put(PROBE_ID, { apiKey: 'plaintext-key' }, 10 * 60 * 1_000);
  });

  afterEach(() => {
    secretStash.drop(PROBE_ID);
    vi.clearAllMocks();
  });

  it('drops the stash on a successful converge', async () => {
    const ok = await runPlaybook(
      { probeId: PROBE_ID, playbook: 'converge', probeSha: 'abc1234' },
      spawnerThatExitsWith(0),
    );
    expect(ok).toBe(true);
    expect(secretStash.get(PROBE_ID)).toBeUndefined();
  });

  it('keeps the stash on a failed converge so a retry can redeliver', async () => {
    const ok = await runPlaybook(
      { probeId: PROBE_ID, playbook: 'converge', probeSha: 'abc1234' },
      spawnerThatExitsWith(1),
    );
    expect(ok).toBe(false);
    expect(secretStash.get(PROBE_ID)).toEqual({ apiKey: 'plaintext-key' });
  });
});

describe('runPlaybook concurrency guard', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('rejects a second run for the same probe while the first is in flight', async () => {
    const { spawner, finish } = spawnerThatStaysOpen();

    const firstRun = runPlaybook(
      { probeId: PROBE_ID, playbook: 'converge', probeSha: 'abc1234' },
      spawner,
    );
    // Yield so the first call reserves its slot before the second call starts.
    await Promise.resolve();

    await expect(
      runPlaybook(
        { probeId: PROBE_ID, playbook: 'converge', probeSha: 'abc1234' },
        spawner,
      ),
    ).rejects.toThrow(/already running/);

    finish(0);
    expect(await firstRun).toBe(true);

    const secondRun = await runPlaybook(
      { probeId: PROBE_ID, playbook: 'converge', probeSha: 'abc1234' },
      spawnerThatExitsWith(0),
    );
    expect(secondRun).toBe(true);
  });
});

describe('runPlaybook spawn failure', () => {
  afterEach(() => {
    secretStash.drop(PROBE_ID);
    vi.clearAllMocks();
  });

  it('resolves false and frees the slot when the spawn errors', async () => {
    secretStash.put(PROBE_ID, { apiKey: 'plaintext-key' }, 10 * 60 * 1_000);

    const ok = await runPlaybook(
      { probeId: PROBE_ID, playbook: 'converge', probeSha: 'abc1234' },
      spawnerThatErrorsWith(new Error('spawn ansible-playbook ENOENT')),
    );
    expect(ok).toBe(false);
    expect(secretStash.get(PROBE_ID)).toEqual({ apiKey: 'plaintext-key' });

    // A retry is admitted, not rejected with "already running", only if the slot was freed on the error path.
    const retry = await runPlaybook(
      { probeId: PROBE_ID, playbook: 'converge', probeSha: 'abc1234' },
      spawnerThatExitsWith(0),
    );
    expect(retry).toBe(true);
  });
});

describe('fireConverge rejection handling', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('catches a rejected converge and records converge_failed instead of crashing', async () => {
    // Occupy the slot with an in-flight run so the fire-and-forget converge rejects synchronously.
    const { spawner, finish } = spawnerThatStaysOpen();
    const inFlight = runPlaybook(
      { probeId: PROBE_ID, playbook: 'converge', probeSha: 'abc1234' },
      spawner,
    );
    await Promise.resolve();
    vi.mocked(recordEvent).mockClear();

    fireConverge(
      { probeId: PROBE_ID, playbook: 'converge', probeSha: 'def5678' },
      'update',
    );

    await vi.waitFor(() => {
      expect(recordEvent).toHaveBeenCalledWith(
        PROBE_ID,
        'converge_failed',
        expect.objectContaining({
          context: 'update',
          reason: expect.stringContaining('already running'),
        }),
      );
    });

    finish(0);
    await inFlight;
  });
});
