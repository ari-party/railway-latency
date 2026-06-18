import { Box, ClientOnly, Stack } from '@chakra-ui/react';
import { useQueryState } from 'nuqs';
import { Suspense, useCallback, useRef } from 'react';

import { CheckQueryInput } from '@/components/logs/checkQueryInput';
import { CheckTable } from '@/components/logs/checkTable';
import { RangeSegmentGroup } from '@/components/querySegmentGroups';
import { coerceRange, DEFAULT_RANGE } from '@/utils/query';
import { useDebouncedValue } from '@/utils/useDebouncedValue';

export default function Logs() {
  const [query, setQuery] = useQueryState('q', { defaultValue: '' });
  const [range, setRange] = useQueryState('range', {
    defaultValue: DEFAULT_RANGE,
  });
  const validatedRange = coerceRange(range);
  const debouncedQuery = useDebouncedValue(query, 350);
  const scrollRef = useRef<HTMLDivElement>(null);

  const addFilter = useCallback(
    (field: string, value: string) => {
      void setQuery((previous) => {
        const tokens = (previous ?? '')
          .split(/\s+/)
          .filter(Boolean)
          .filter((token) => !token.toLowerCase().startsWith(`@${field}:`));
        tokens.push(`@${field}:${value}`);
        return tokens.join(' ');
      });
    },
    [setQuery],
  );

  return (
    <Stack height="100%" gap="0">
      <Box
        position="sticky"
        top="0"
        zIndex="docked"
        bg="bg.subtle"
        borderBottomWidth="1px"
        borderColor="border.muted"
        paddingX="6"
        paddingY="3"
      >
        <Stack
          direction="row"
          gap="3"
          align="center"
          maxWidth="7xl"
          marginX="auto"
          width="100%"
        >
          <CheckQueryInput
            value={query}
            onChange={(next) => void setQuery(next || null)}
          />
          <RangeSegmentGroup
            value={validatedRange}
            onValueChange={(value) => void setRange(value)}
          />
        </Stack>
      </Box>
      <Box
        ref={scrollRef}
        flex="1"
        overflow="auto"
        paddingX="6"
        paddingTop="0"
        paddingBottom="3"
      >
        <Box maxWidth="7xl" marginX="auto">
          <ClientOnly>
            <Suspense fallback={null}>
              <CheckTable
                query={debouncedQuery}
                range={validatedRange}
                scrollRef={scrollRef}
                onFilter={addFilter}
              />
            </Suspense>
          </ClientOnly>
        </Box>
      </Box>
    </Stack>
  );
}
