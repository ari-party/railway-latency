const UNIT_TO_MS: Record<string, number> = {
  ns: 1 / 1_000_000,
  us: 1 / 1_000,
  ms: 1,
  s: 1_000,
  m: 60 * 1_000,
  h: 60 * 60 * 1_000,
  d: 24 * 60 * 60 * 1_000,
  w: 7 * 24 * 60 * 60 * 1_000,
};

export function parseFluxDurationMs(duration: string): number {
  const match = /^(\d+)(ns|us|ms|s|m|h|d|w)$/.exec(duration);
  if (!match) throw new Error(`invalid flux duration: ${duration}`);
  const amount = Number(match[1]);
  return Math.max(1, Math.round(amount * UNIT_TO_MS[match[2]]));
}
