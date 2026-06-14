const MINUTE_MS = 60 * 1_000;
const HOUR_MS = 60 * 60 * 1_000;
const DAY_MS = 24 * 60 * 60 * 1_000;

export function relativeTime(
  timestamp: string | null,
  now: number = Date.now(),
): string {
  if (!timestamp) return 'never';

  const then = new Date(timestamp).getTime();
  if (Number.isNaN(then)) return 'never';

  const elapsed = now - then;
  if (elapsed < MINUTE_MS) {
    return `${Math.max(0, Math.floor(elapsed / 1_000))}s`;
  }
  if (elapsed < HOUR_MS) {
    return `${Math.floor(elapsed / MINUTE_MS)}m`;
  }
  if (elapsed < DAY_MS) {
    return `${Math.floor(elapsed / HOUR_MS)}h`;
  }
  return `${Math.floor(elapsed / DAY_MS)}d`;
}

export function fullTimestamp(timestamp: string | null): string {
  if (!timestamp) return 'never';

  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return 'never';

  return `${parsed.toISOString().slice(0, 19).replace('T', ' ')} UTC`;
}

export function shortSha(sha: string | null): string {
  if (!sha) return '';
  return sha.slice(0, 7);
}

export function hasDrift(
  deployedSha: string | null,
  latestSha: string | null,
): boolean {
  if (!deployedSha || !latestSha) return false;
  return deployedSha !== latestSha;
}
