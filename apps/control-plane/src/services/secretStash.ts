interface StashEntry {
  apiKey: string;
}

interface TimedEntry extends StashEntry {
  expiresAt: number;
}

const entries = new Map<string, TimedEntry>();

export const secretStash = {
  put(probeId: string, entry: StashEntry, ttlMs: number): void {
    entries.set(probeId, { ...entry, expiresAt: Date.now() + ttlMs });
  },
  get(probeId: string): StashEntry | undefined {
    const entry = entries.get(probeId);

    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      entries.delete(probeId);
      return undefined;
    }

    return { apiKey: entry.apiKey };
  },
  drop(probeId: string): void {
    entries.delete(probeId);
  },
};
