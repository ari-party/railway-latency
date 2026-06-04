import React from 'react';

import { QueryResultChart } from '@/components/queryResultChart';
import { trpc } from '@/utils/trpc';

import type { FrontendRange } from '@/pages/query';
import type {
  Measurement,
  Network,
  QueryResultLine,
} from '@railway-latency/types';

const NETWORK_MEASUREMENTS: Record<Network, Measurement[]> = {
  private: ['http', 'dns', 'handshake'],
  public: ['httpPublic', 'httpPublicHikari', 'dnsPublic', 'handshakePublic'],
  proxied: ['httpProxied', 'dnsProxied', 'handshakeProxied'],
};

export function QueryChart({
  dst,
  network,
  range,
  src,
}: {
  dst: string;
  network: Network;
  range: FrontendRange;
  src: string;
}) {
  const internalRange = range === 'live' ? '15m' : range;
  const activeMeasurements = NETWORK_MEASUREMENTS[network];

  const [dataLines] = trpc.chart.query.useSuspenseQuery({
    src,
    dst,
    range: internalRange,
    network,
  });
  const [lines, setLines] = React.useState<QueryResultLine[]>(dataLines ?? []);

  trpc.chart.events.useSubscription(
    { src, dst },
    {
      enabled: range === 'live',
      onData: (data) => {
        if (!activeMeasurements.includes(data[0])) return;

        setLines((lines) => {
          const now = Date.now();
          const windowStart = now - 15 * 60 * 1000;
          const updatedLines = [...lines, data];

          const filtered: typeof updatedLines = [];
          for (let i = updatedLines.length - 1; i >= 0; i -= 1) {
            const line = updatedLines[i];
            const timestamp = Date.parse(line[1]);
            if (!Number.isFinite(timestamp) || timestamp < windowStart) break;

            filtered.push(line);
          }
          filtered.reverse();

          return filtered.sort((a, b) => Date.parse(a[1]) - Date.parse(b[1]));
        });
      },
    },
  );

  React.useEffect(() => {
    setLines(dataLines ?? []);
  }, [dataLines, range, network]);

  return <QueryResultChart lines={lines} range={internalRange} />;
}
