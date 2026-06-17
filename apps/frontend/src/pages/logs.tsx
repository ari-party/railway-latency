import { Box, ClientOnly, Input, Stack } from '@chakra-ui/react';
import { useQueryState } from 'nuqs';
import { Suspense } from 'react';

import { CheckTable } from '@/components/logs/checkTable';
import { RangeSegmentGroup } from '@/components/querySegmentGroups';
import { coerceRange, DEFAULT_RANGE } from '@/utils/query';

export default function Logs() {
  const [query, setQuery] = useQueryState('q', { defaultValue: '' });
  const [range, setRange] = useQueryState('range', {
    defaultValue: DEFAULT_RANGE,
  });
  const validatedRange = coerceRange(range);

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
          <Input
            flex="1"
            fontFamily="mono"
            fontSize="sm"
            placeholder="@status:>=400 @network:public @dst:… free text"
            value={query}
            onChange={(event) => void setQuery(event.target.value || null)}
          />
          <RangeSegmentGroup
            value={validatedRange}
            onValueChange={(value) => void setRange(value)}
          />
        </Stack>
      </Box>
      <Box flex="1" overflow="auto" padding="3">
        <Box maxWidth="7xl" marginX="auto">
          <ClientOnly>
            <Suspense fallback={null}>
              <CheckTable query={query} range={validatedRange} />
            </Suspense>
          </ClientOnly>
        </Box>
      </Box>
    </Stack>
  );
}
