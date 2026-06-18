import { Box, Button, ClientOnly, Text } from '@chakra-ui/react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useQueryState } from 'nuqs';
import {
  Suspense,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { CheckDetailDrawer } from '@/components/logs/checkDetailDrawer';
import { CheckLatencyStrip } from '@/components/logs/checkLatencyStrip';
import { CheckHeaderRow, CheckRow } from '@/components/logs/checkRow';
import { parseCheckQuery } from '@/utils/checkQuery';
import { RANGE_WINDOW_MS } from '@/utils/query';
import { trpc } from '@/utils/trpc';

import type { FrontendRange } from '@/utils/query';
import type { RefObject } from 'react';

function rowKey(row: {
  time: number;
  src: string;
  dst: string;
  network: string;
}) {
  return `${row.time}:${row.src}:${row.dst}:${row.network}`;
}

export function CheckTable({
  onFilter,
  query,
  range,
  scrollRef,
}: {
  onFilter: (field: string, value: string) => void;
  query: string;
  range: FrontendRange;
  scrollRef: RefObject<HTMLDivElement | null>;
}) {
  const [selected, setSelected] = useQueryState('selected');
  const filters = useMemo(() => parseCheckQuery(query), [query]);
  // Match OR only as a standalone token so values like @edge:or-iad stay simple.
  const isSimpleQuery = useMemo(
    () => !/(^|\s)or(\s|$)/i.test(query) && !/[()]/.test(query),
    [query],
  );
  const refetchInterval = range === 'live' ? RANGE_WINDOW_MS.live * 5 : false;
  const revealOlder = useRef(false);
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  const [data, { fetchNextPage, hasNextPage, isFetchingNextPage }] =
    trpc.checks.query.useSuspenseInfiniteQuery(
      { query, range, limit: 100 },
      {
        getNextPageParam: (lastPage) => lastPage?.cursor ?? undefined,
        initialCursor: undefined,
        refetchInterval,
      },
    );

  const pages = data.pages;
  const rows = useMemo(
    () => pages.flatMap((page) => page?.rows ?? []),
    [pages],
  );
  const displayRows = useMemo(() => [...rows].reverse(), [rows]);
  const isUnavailable = pages.length > 0 && pages[0] === null;
  const hasRows = !isUnavailable && rows.length > 0;

  const virtualizer = useVirtualizer({
    count: displayRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 28,
    overscan: 10,
    scrollMargin,
    getItemKey: (index) => rowKey(displayRows[index]),
  });

  useLayoutEffect(() => {
    setScrollMargin(listRef.current?.offsetTop ?? 0);
  }, [filters.src, filters.dst, filters.network, hasRows, hasNextPage]);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [scrollRef]);

  useLayoutEffect(() => {
    if (!revealOlder.current) return;
    const element = scrollRef.current;
    if (element) element.scrollTop = 0;
    revealOlder.current = false;
  }, [pages.length, scrollRef]);

  function loadMore() {
    revealOlder.current = true;
    void fetchNextPage();
  }

  const handleSelect = useCallback(
    (key: string) => {
      void setSelected(key);
    },
    [setSelected],
  );

  return (
    <Box position="relative">
      {isSimpleQuery && filters.src && filters.dst && filters.network && (
        <ClientOnly>
          <Suspense fallback={<Box height="210px" marginY="3" />}>
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
      {hasRows && (
        <Box paddingY="2" textAlign="center">
          {hasNextPage ? (
            <Button
              color="fg.muted"
              disabled={isFetchingNextPage}
              size="sm"
              variant="ghost"
              onClick={loadMore}
            >
              {isFetchingNextPage ? 'Loading…' : 'Load more'}
            </Button>
          ) : (
            <Text color="fg.subtle" fontSize="2xs">
              Beginning of range
            </Text>
          )}
        </Box>
      )}
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
      <div
        ref={listRef}
        style={{
          position: 'relative',
          height: `${virtualizer.getTotalSize()}px`,
        }}
      >
        {virtualizer.getVirtualItems().map((item) => {
          const row = displayRows[item.index];
          const key = rowKey(row);
          return (
            <div
              key={item.key}
              ref={virtualizer.measureElement}
              data-index={item.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${item.start - scrollMargin}px)`,
              }}
            >
              <CheckRow
                row={row}
                rowKey={key}
                selected={selected === key}
                onFilter={onFilter}
                onSelect={handleSelect}
              />
            </div>
          );
        })}
      </div>
      {selected && (
        <CheckDetailDrawer
          selectedKey={selected}
          onClose={() => void setSelected(null)}
        />
      )}
    </Box>
  );
}
