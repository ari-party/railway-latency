import { ClientOnly, Stack, Tabs, Text } from '@chakra-ui/react';
import React, { Suspense } from 'react';

import { QueryChart } from '@/components/queryChart';
import { QueryResultChartSkeleton } from '@/components/queryResultChart';

import type { FrontendRange } from '@/utils/query';
import type { Network } from '@railway-latency/types';

export function PairDetail({
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
  return (
    <Stack
      borderWidth="1px"
      borderColor="gray.200"
      borderRadius="lg"
      padding={4}
      gap={3}
    >
      <Text as="h6" fontWeight={600} color="white">
        {src} → {dst}
      </Text>

      <Tabs.Root defaultValue="latency" variant="line" size="sm">
        <Tabs.List>
          <Tabs.Trigger value="latency">Latency</Tabs.Trigger>
          <Tabs.Trigger value="mtr">MTR</Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="latency">
          <ClientOnly fallback={<QueryResultChartSkeleton />}>
            <Suspense fallback={<QueryResultChartSkeleton />}>
              <QueryChart src={src} dst={dst} network={network} range={range} />
            </Suspense>
          </ClientOnly>
        </Tabs.Content>

        <Tabs.Content value="mtr">
          <Text color="fg.muted" paddingY={6} textAlign="center">
            MTR — coming soon.
          </Text>
        </Tabs.Content>
      </Tabs.Root>
    </Stack>
  );
}
