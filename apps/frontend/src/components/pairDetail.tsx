import {
  Box,
  Button,
  ClientOnly,
  Flex,
  HStack,
  Stack,
  Tabs,
  Text,
} from '@chakra-ui/react';
import NextLink from 'next/link';
import { useQueryState } from 'nuqs';
import React, { Suspense } from 'react';
import { LuArrowLeft, LuArrowRight, LuScrollText } from 'react-icons/lu';

import { MtrHops } from '@/components/mtrHops';
import { QueryChart } from '@/components/queryChart';
import { QueryResultChartSkeleton } from '@/components/queryResultChart';

import type { FrontendRange } from '@/utils/query';
import type { Network } from '@railway-latency/types';

export function PairDetail({
  dst,
  network,
  onBack,
  range,
  src,
}: {
  dst: string;
  network: Network;
  onBack?: () => void;
  range: FrontendRange;
  src: string;
}) {
  const [tab, setTab] = useQueryState('tab', { defaultValue: 'latency' });

  return (
    <Stack
      borderWidth="1px"
      borderColor="border.DEFAULT"
      borderRadius="xl"
      bg="bg.panel"
      padding="5"
      gap="4"
    >
      <Flex justify="space-between" align="center" gap="3" wrap="wrap">
        <HStack
          gap="2.5"
          fontFamily="mono"
          fontSize="md"
          fontWeight="semibold"
          color="fg"
        >
          <Text>{src}</Text>
          <Box color="accent">
            <LuArrowRight size={16} />
          </Box>
          <Text>{dst}</Text>
        </HStack>

        <HStack gap="2">
          <Button asChild color="fg.muted" size="xs" variant="ghost">
            <NextLink
              href={{
                pathname: '/logs',
                query: {
                  q: `@src:${src} @dst:${dst} @network:${network}`,
                  range,
                },
              }}
            >
              <LuScrollText size={14} />
              View requests
            </NextLink>
          </Button>

          {onBack && (
            <HStack
              as="button"
              gap="1.5"
              color="fg.muted"
              fontSize="sm"
              _hover={{ color: 'fg' }}
              onClick={onBack}
            >
              <LuArrowLeft size={14} />
              <Text>All destinations</Text>
            </HStack>
          )}
        </HStack>
      </Flex>

      <Tabs.Root
        value={tab}
        onValueChange={(details) => setTab(details.value)}
        variant="plain"
        size="sm"
      >
        <Tabs.List
          borderBottomWidth="1px"
          borderColor="border.muted"
          gap="5"
          marginBottom="3"
        >
          {[
            { value: 'latency', label: 'Latency' },
            { value: 'mtr', label: 'MTR' },
          ].map((item) => (
            <Tabs.Trigger
              key={item.value}
              value={item.value}
              paddingX="0"
              paddingY="2"
              marginBottom="-1px"
              color="fg.muted"
              fontWeight="medium"
              borderBottomWidth="2px"
              borderColor="transparent"
              borderRadius="0"
              transition="color 0.15s ease, border-color 0.15s ease"
              _hover={{ color: 'fg' }}
              _selected={{ color: 'fg', borderColor: 'accent' }}
            >
              {item.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="latency" paddingTop="0">
          <ClientOnly fallback={<QueryResultChartSkeleton />}>
            <Suspense fallback={<QueryResultChartSkeleton />}>
              <QueryChart src={src} dst={dst} network={network} range={range} />
            </Suspense>
          </ClientOnly>
        </Tabs.Content>

        <Tabs.Content value="mtr" paddingTop="0">
          <MtrHops src={src} dst={dst} network={network} />
        </Tabs.Content>
      </Tabs.Root>
    </Stack>
  );
}
