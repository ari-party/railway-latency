import { ClientOnly, Stack, Tabs, Text } from '@chakra-ui/react';
import { useQueryState } from 'nuqs';
import React, { Suspense } from 'react';

import { MtrHops } from '@/components/mtrHops';
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
  const [tab, setTab] = useQueryState('tab', { defaultValue: 'latency' });

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

      <Tabs.Root
        value={tab}
        onValueChange={(details) => setTab(details.value)}
        variant="line"
        size="sm"
      >
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
          <MtrHops src={src} dst={dst} network={network} />
        </Tabs.Content>
      </Tabs.Root>
    </Stack>
  );
}
