import { Box, ClientOnly, Flex, HStack, Stack, Text } from '@chakra-ui/react';
import { useQueryState } from 'nuqs';
import React from 'react';

import { DestinationGrid } from '@/components/destinationGrid';
import { FleetMap } from '@/components/fleet/fleetMap';
import { ProbeSidebar } from '@/components/fleet/probeSidebar';
import { railwayMarkersFromRegions } from '@/components/map/markers';
import { PairDetail } from '@/components/pairDetail';
import {
  NetworkSegmentGroup,
  RangeSegmentGroup,
} from '@/components/querySegmentGroups';
import { env } from '@/env';
import { coerceNetwork, coerceRange, DEFAULT_RANGE } from '@/utils/query';
import { trpc } from '@/utils/trpc';

import type { Network } from '@railway-latency/types';
import type { GetServerSideProps } from 'next';

const FLEET_NETWORKS = [
  'public',
  'proxied',
] as const satisfies readonly Network[];

interface FleetPageProps {
  railwayRegions: string[];
}

export const getServerSideProps: GetServerSideProps<
  FleetPageProps
> = async () => {
  return { props: { railwayRegions: env.RAILWAY_REPLICA_REGIONS ?? [] } };
};

export default function FleetPage({ railwayRegions }: FleetPageProps) {
  const [probes] = trpc.probes.list.useSuspenseQuery(undefined, {
    refetchInterval: 30 * 1_000,
  });
  const regionMarkers = railwayMarkersFromRegions(railwayRegions);

  const [selected, setSelected] = useQueryState('probe', { defaultValue: '' });
  const [dst, setDst] = useQueryState('dst', { defaultValue: '' });
  const [range, setRange] = useQueryState('range', {
    defaultValue: DEFAULT_RANGE,
  });
  const [net, setNet] = useQueryState('net', { defaultValue: 'public' });

  const resolvedNetwork = coerceNetwork(net);
  const network: Network =
    resolvedNetwork === 'private' ? 'public' : resolvedNetwork;
  const validatedRange = coerceRange(range);
  const selectedProbe =
    probes.find((probe) => probe.probeId === selected) ?? null;
  const focusedDst = railwayRegions.includes(dst) ? dst : null;

  React.useEffect(() => {
    if (resolvedNetwork === 'private') void setNet('public');
  }, [resolvedNetwork, setNet]);

  const selectProbe = (probeId: string) => {
    void setSelected(probeId);
    void setDst('');
  };

  return (
    <Flex height="100%" minHeight={0}>
      <ProbeSidebar
        probes={probes}
        selectedProbeId={selectedProbe?.probeId ?? null}
        onSelect={selectProbe}
      />

      <Box flex="1" minWidth={0} height="100%" overflow="hidden">
        {selectedProbe == null ? (
          <ClientOnly fallback={null}>
            <FleetMap
              probes={probes}
              regions={regionMarkers}
              onSelectProbe={selectProbe}
            />
          </ClientOnly>
        ) : (
          <Box height="100%" overflowY="auto">
            <Stack
              maxWidth="6xl"
              marginX="auto"
              paddingX={4}
              paddingY={6}
              gap={4}
            >
              <HStack justify="space-between" flexWrap="wrap" gap={2}>
                <HStack gap={2}>
                  <Text
                    as="button"
                    color="fg.muted"
                    _hover={{ color: 'fg' }}
                    onClick={() => selectProbe('')}
                  >
                    Map
                  </Text>
                  <Text color="fg.muted">/</Text>
                  {focusedDst ? (
                    <>
                      <Text
                        as="button"
                        color="fg.muted"
                        _hover={{ color: 'fg' }}
                        onClick={() => setDst('')}
                      >
                        {selectedProbe.probeId}
                      </Text>
                      <Text color="fg.muted">/</Text>
                      <Text fontWeight={600} color="white">
                        {focusedDst}
                      </Text>
                    </>
                  ) : (
                    <Text fontWeight={600} color="white">
                      {selectedProbe.probeId}
                    </Text>
                  )}
                </HStack>

                <HStack gap={2}>
                  <RangeSegmentGroup
                    value={validatedRange}
                    onValueChange={setRange}
                  />
                  <NetworkSegmentGroup
                    value={network}
                    options={FLEET_NETWORKS}
                    onValueChange={setNet}
                  />
                </HStack>
              </HStack>

              {focusedDst ? (
                <PairDetail
                  src={selectedProbe.probeId}
                  dst={focusedDst}
                  network={network}
                  range={validatedRange}
                />
              ) : (
                <DestinationGrid
                  src={selectedProbe.probeId}
                  destinations={railwayRegions}
                  network={network}
                  range={validatedRange}
                  onFocus={(destination) => setDst(destination)}
                />
              )}
            </Stack>
          </Box>
        )}
      </Box>
    </Flex>
  );
}
