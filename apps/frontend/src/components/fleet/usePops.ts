import { useEffect, useState } from 'react';

const POPS_REFETCH_INTERVAL = 60 * 1_000;

export interface RailwayPop {
  id: string;
  name: string;
  region: string;
  status: string;
  geo: { lat: number; lon: number };
}

interface PopsResponse {
  pops: RailwayPop[];
}

export function usePops(): RailwayPop[] {
  const [pops, setPops] = useState<RailwayPop[]>([]);

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      try {
        const response = await fetch('/.railway/pops', {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const data = (await response.json()) as PopsResponse;
        setPops(data.pops);
      } catch {
        // Transient fetch/abort failures are ignored; the next tick retries.
      }
    };

    void load();
    const interval = setInterval(() => void load(), POPS_REFETCH_INTERVAL);

    return () => {
      controller.abort();
      clearInterval(interval);
    };
  }, []);

  return pops;
}
