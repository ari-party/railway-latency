import type { ProbeConverge } from '@railway-latency/types';

export type ConvergeRunState = 'queued' | 'running' | 'ok' | 'failed';

export function convergeRunState(
  converge: ProbeConverge,
  baselineEventAt: string | null,
): ConvergeRunState {
  if (converge.running) return 'running';

  // compares two server timestamps, never the browser clock, so it is skew-free
  if (converge.lastResult && converge.lastEventAt !== baselineEventAt)
    return converge.lastResult;

  return 'queued';
}

export const RUN_STATE_GLYPH: Record<ConvergeRunState, string> = {
  queued: '·',
  running: '⟳',
  ok: '✓',
  failed: '✗',
};

export const RUN_STATE_LABEL: Record<ConvergeRunState, string> = {
  queued: 'Queued',
  running: 'Running',
  ok: 'Done',
  failed: 'Failed',
};

export const RUN_STATE_COLOR: Record<ConvergeRunState, string> = {
  queued: 'fg.muted',
  running: 'blue.fg',
  ok: 'green.fg',
  failed: 'red.fg',
};

export interface RunProgress {
  total: number;
  done: number;
  failed: number;
}

export function summarizeRun(states: ConvergeRunState[]): RunProgress {
  return {
    total: states.length,
    done: states.filter((state) => state === 'ok' || state === 'failed').length,
    failed: states.filter((state) => state === 'failed').length,
  };
}
