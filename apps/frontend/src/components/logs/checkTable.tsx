import { Box, Button, ClientOnly, Text } from '@chakra-ui/react';
import { useQueryState } from 'nuqs';
import { Suspense, useMemo } from 'react';

import { CheckDetailDrawer } from '@/components/logs/checkDetailDrawer';
import { CheckLatencyStrip } from '@/components/logs/checkLatencyStrip';
import { CheckHeaderRow, CheckRow } from '@/components/logs/checkRow';
import { parseCheckQuery } from '@/utils/checkQuery';
import { RANGE_WINDOW_MS } from '@/utils/query';
import { trpc } from '@/utils/trpc';

import type { FrontendRange } from '@/utils/query';

export function CheckTable({
  query,
  range,
}: {
  query: string;
  range: FrontendRange;
}) {
  const [selected, setSelected] = useQueryState('selected');
  const filters = useMemo(() => parseCheckQuery(query), [query]);
  const refetchInterval = range === 'live' ? RANGE_WINDOW_MS.live * 5 : false;

  const [data, { fetchNextPage, hasNextPage, isFetchingNextPage }] =
    trpc.checks.query.useSuspenseInfiniteQuery(
      { filters, range, limit: 100 },
      {
        getNextPageParam: (lastPage) => lastPage?.cursor ?? undefined,
        initialCursor: undefined,
        refetchInterval,
      },
    );

  const pages = data.pages;
  const rows = pages.flatMap((page) => page?.rows ?? []);
  const isUnavailable = pages.length > 0 && pages[0] === null;

  return (
    <Box position="relative">
      {filters.src && filters.dst && filters.network && (
        <ClientOnly>
          <Suspense fallback={<Box height="120px" />}>
            <CheckLatencyStrip
              dst={filters.dst}
              network={filters.network}
              range={range}
              src={filters.src}
            />
          </Suspense>
        </ClientOnly>
      )}
      <CheckHeaderRow />
      {isUnavailable && (
        <Text padding="6" color="fg.muted" fontSize="sm">
          Data source unavailable.
        </Text>
      )}
      {!isUnavailable && rows.length === 0 && (
        <Text padding="6" color="fg.muted" fontSize="sm">
          No checks match this query.
        </Text>
      )}
      {rows.map((row) => {
        const key = `${row.time}:${row.src}:${row.dst}:${row.network}`;
        return (
          <CheckRow
            key={key}
            row={row}
            selected={selected === key}
            onSelect={() => void setSelected(key)}
          />
        );
      })}
      {hasNextPage && (
        <Box paddingTop="3">
          <Button
            color="fg.muted"
            disabled={isFetchingNextPage}
            size="sm"
            variant="ghost"
            onClick={() => void fetchNextPage()}
          >
            {isFetchingNextPage ? 'Loading…' : 'Load older'}
          </Button>
        </Box>
      )}
      {selected && (
        <CheckDetailDrawer
          selectedKey={selected}
          onClose={() => void setSelected(null)}
        />
      )}
    </Box>
  );
}
