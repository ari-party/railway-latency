import { ClientOnly, Flex, HStack, Stack, Text } from '@chakra-ui/react';
import NextLink from 'next/link';
import { useRouter } from 'next/router';
import React, { Suspense } from 'react';
import { LuArrowLeft } from 'react-icons/lu';

import { MetricsChartSkeleton } from '@/components/metrics/metricsChart';
import { PopLatencyChart } from '@/components/pop/popLatencyChart';
import { PopPageLayout, usePopHref } from '@/components/pop/popPageLayout';
import { PopVolumeChart } from '@/components/pop/popVolumeChart';
import { trpc } from '@/utils/trpc';

function ChartPanel({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <Stack
      borderWidth="1px"
      borderColor="border.DEFAULT"
      borderRadius="xl"
      bg="bg.panel"
      padding="5"
      gap="4"
    >
      <Text fontWeight="medium">{title}</Text>
      <ClientOnly fallback={<MetricsChartSkeleton />}>
        <Suspense fallback={<MetricsChartSkeleton />}>{children}</Suspense>
      </ClientOnly>
    </Stack>
  );
}

export default function PopDetail() {
  const router = useRouter();
  const popHref = usePopHref();

  const [regions] = trpc.regions.useSuspenseQuery();

  const pop = typeof router.query.pop === 'string' ? router.query.pop : '';

  return (
    <PopPageLayout contained regions={regions}>
      {({ dst, range }) => (
        <Stack gap="5">
          <Flex justify="space-between" align="center" gap="3">
            <Text fontFamily="mono" fontSize="md" fontWeight="semibold">
              {pop}
            </Text>
            <HStack
              asChild
              gap="1.5"
              color="fg.muted"
              fontSize="sm"
              _hover={{ color: 'fg' }}
            >
              <NextLink href={popHref(null)}>
                <LuArrowLeft size={14} />
                <Text>All PoPs</Text>
              </NextLink>
            </HStack>
          </Flex>

          <ChartPanel
            title={`Public latency by ${dst ? 'probe' : 'region'} (p99)`}
          >
            <PopLatencyChart dst={dst} pop={pop} range={range} />
          </ChartPanel>

          <ChartPanel title="Request volume by probe">
            <PopVolumeChart dst={dst} pop={pop} range={range} />
          </ChartPanel>
        </Stack>
      )}
    </PopPageLayout>
  );
}
