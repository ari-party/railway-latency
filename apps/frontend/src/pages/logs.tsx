import { Box, ClientOnly, Stack } from '@chakra-ui/react';
import { useQueryState } from 'nuqs';
import { Suspense, useRef } from 'react';

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

  return (
    <Stack height="100%" gap="0">
      <Box
        position="sticky"
        top="0"
        zIndex="docked"
        bg="bg.subtle"
        borderBottomWidth="1px"
        borderColor="border.muted"
        padding="3"
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
        padding="3"
        paddingTop="0"
      >
        <Box maxWidth="7xl" marginX="auto">
          <ClientOnly>
            <Suspense fallback={null}>
              <CheckTable
                query={debouncedQuery}
                range={validatedRange}
                scrollRef={scrollRef}
              />
            </Suspense>
          </ClientOnly>
        </Box>
      </Box>
    </Stack>
  );
}
