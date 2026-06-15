import { describe, expect, it } from 'vitest';

import { convergeRunState, summarizeRun } from '@/lib/converge';

import type { ProbeConverge } from '@railway-latency/types';

function converge(partial: Partial<ProbeConverge>): ProbeConverge {
  return { running: false, lastResult: null, lastEventAt: null, ...partial };
}

describe('convergeRunState', () => {
  it('is running while the converge is in flight', () => {
    expect(convergeRunState(converge({ running: true }), null)).toBe('running');
  });

  it('is queued when nothing has happened since the run started', () => {
    expect(convergeRunState(converge({}), null)).toBe('queued');
  });

  it('ignores a stale terminal result from before the run (unchanged baseline)', () => {
    const state = convergeRunState(
      converge({ lastResult: 'ok', lastEventAt: '2026-06-15T00:00:00Z' }),
      '2026-06-15T00:00:00Z',
    );
    expect(state).toBe('queued');
  });

  it('reports the fresh terminal result once a newer event appears', () => {
    const state = convergeRunState(
      converge({ lastResult: 'failed', lastEventAt: '2026-06-15T00:05:00Z' }),
      '2026-06-15T00:00:00Z',
    );
    expect(state).toBe('failed');
  });

  it('counts a first-ever result against a null baseline as fresh', () => {
    const state = convergeRunState(
      converge({ lastResult: 'ok', lastEventAt: '2026-06-15T00:05:00Z' }),
      null,
    );
    expect(state).toBe('ok');
  });

  it('stays running even when a fresh terminal result is also present', () => {
    const state = convergeRunState(
      converge({
        running: true,
        lastResult: 'failed',
        lastEventAt: '2026-06-15T00:05:00Z',
      }),
      '2026-06-15T00:00:00Z',
    );
    expect(state).toBe('running');
  });
});

describe('summarizeRun', () => {
  it('tallies done (terminal) and failed states', () => {
    expect(summarizeRun(['queued', 'running', 'ok', 'failed', 'ok'])).toEqual({
      total: 5,
      done: 3,
      failed: 1,
    });
  });

  it('reports zero done when everything is still queued', () => {
    expect(summarizeRun(['queued', 'queued'])).toEqual({
      total: 2,
      done: 0,
      failed: 0,
    });
  });

  it('reports all done when everything reached a terminal state', () => {
    expect(summarizeRun(['ok', 'failed'])).toEqual({
      total: 2,
      done: 2,
      failed: 1,
    });
  });
});
