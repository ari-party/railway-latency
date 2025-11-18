import React from 'react';

import { QueryResultChart } from '@/components/queryResultChart';
import { trpc } from '@/utils/trpc';

import type { FrontendRange } from '@/pages/query';
import type { QueryResultLine } from '@railway-latency/types';

export function QueryChart({
  dst,
  range,
  src,
}: {
  dst: string;
  range: FrontendRange;
  src: string;
}) {
  const internalRange = range === 'live' ? '15m' : range;

  const [dataLines] = trpc.chart.query.useSuspenseQuery({
    src,
    dst,
    range: internalRange,
  });
  const [lines, setLines] = React.useState<QueryResultLine[]>(dataLines ?? []);

  trpc.chart.events.useSubscription(
    { src, dst },
    {
      enabled: range === 'live',
      onData: (data) => {
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
  }, [dataLines, range]);

  return <QueryResultChart lines={lines} range={internalRange} />;
}
