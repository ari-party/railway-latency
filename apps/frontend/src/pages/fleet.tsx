import { Box, Button, ClientOnly, Flex } from '@chakra-ui/react';
import { useQueryState } from 'nuqs';
import React from 'react';
import { LuList } from 'react-icons/lu';

import { FleetMap } from '@/components/fleet/fleetMap';
import { ProbeDetailPanel } from '@/components/fleet/probeDetailPanel';
import { ProbeSidebar } from '@/components/fleet/probeSidebar';
import { RegionDetailPanel } from '@/components/fleet/regionDetailPanel';
import { railwayMarkersFromRegions } from '@/components/map/markers';
import { env } from '@/env';
import { coerceNetwork, coerceRange, DEFAULT_RANGE } from '@/utils/query';
import { trpc } from '@/utils/trpc';

import type { Network } from '@railway-latency/types';
import type { GetServerSideProps } from 'next';

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
  const regionMarkers = React.useMemo(
    () => railwayMarkersFromRegions(railwayRegions),
    [railwayRegions],
  );

  const [selected, setSelected] = useQueryState('probe', { defaultValue: '' });
  const [selectedRegionId, setSelectedRegionId] = useQueryState('region', {
    defaultValue: '',
  });
  const [dst, setDst] = useQueryState('dst', { defaultValue: '' });
  const [range, setRange] = useQueryState('range', {
    defaultValue: DEFAULT_RANGE,
  });
  const [net, setNet] = useQueryState('net', { defaultValue: 'public' });
  const [listOpen, setListOpen] = React.useState(false);

  const resolvedNetwork = coerceNetwork(net);
  const network: Network =
    resolvedNetwork === 'private' ? 'public' : resolvedNetwork;
  const validatedRange = coerceRange(range);
  const selectedProbe =
    probes.find((probe) => probe.probeId === selected) ?? null;
  const selectedRegion =
    !selectedProbe && selectedRegionId
      ? (regionMarkers.find((marker) => marker.region === selectedRegionId) ??
        null)
      : null;
  const focusedDst = railwayRegions.includes(dst) ? dst : null;

  React.useEffect(() => {
    if (resolvedNetwork === 'private') void setNet('public');
  }, [resolvedNetwork, setNet]);

  const selectProbe = React.useCallback(
    (probeId: string) => {
      void setSelected(probeId);
      void setSelectedRegionId('');
      void setDst('');
      setListOpen(false);
    },
    [setSelected, setSelectedRegionId, setDst],
  );

  const selectRegion = React.useCallback(
    (region: string) => {
      void setSelectedRegionId(region);
      void setSelected('');
      void setDst('');
      setListOpen(false);
    },
    [setSelectedRegionId, setSelected, setDst],
  );

  const closePanel = React.useCallback(() => {
    void setSelected('');
    void setSelectedRegionId('');
    void setDst('');
  }, [setSelected, setSelectedRegionId, setDst]);

  return (
    <Flex height="100%" minHeight={0} position="relative">
      <Box
        position={{ base: 'absolute', md: 'relative' }}
        top="0"
        bottom="0"
        left="0"
        zIndex={{ base: 30, md: 'auto' }}
        height="100%"
        flexShrink={0}
        transform={{
          base: listOpen ? 'translateX(0)' : 'translateX(-100%)',
          md: 'none',
        }}
        transition="transform 0.2s ease"
        boxShadow={{
          base: listOpen ? '8px 0 28px rgba(0, 0, 0, 0.55)' : 'none',
          md: 'none',
        }}
      >
        <ProbeSidebar
          probes={probes}
          selectedProbeId={selectedProbe?.probeId ?? null}
          onSelect={selectProbe}
        />
      </Box>

      {listOpen && (
        <Box
          display={{ base: 'block', md: 'none' }}
          position="absolute"
          inset="0"
          zIndex={20}
          bg="blackAlpha.600"
          onClick={() => setListOpen(false)}
        />
      )}

      <Box
        flex="1"
        minWidth={0}
        height="100%"
        position="relative"
        overflow="hidden"
      >
        <ClientOnly fallback={null}>
          <FleetMap
            network={network}
            probes={probes}
            regions={regionMarkers}
            selectedProbeId={selectedProbe?.probeId ?? null}
            selectedRegion={selectedRegion}
            onSelectProbe={selectProbe}
            onSelectRegion={selectRegion}
          />
        </ClientOnly>

        {!selectedProbe && !selectedRegion && (
          <Button
            display={{ base: 'inline-flex', md: 'none' }}
            position="absolute"
            top="3"
            right="3"
            zIndex={5}
            size="sm"
            variant="ghost"
            bg="bg.subtle"
            borderWidth="1px"
            borderColor="border.DEFAULT"
            color="fg"
            _hover={{ bg: 'bg.emphasized' }}
            onClick={() => setListOpen(true)}
          >
            <LuList />
            Probes
          </Button>
        )}

        {selectedProbe && (
          <ProbeDetailPanel
            probe={selectedProbe}
            railwayRegions={railwayRegions}
            network={network}
            range={validatedRange}
            focusedDst={focusedDst}
            setRange={setRange}
            setNet={setNet}
            setDst={setDst}
            onClose={closePanel}
          />
        )}

        {selectedRegion && (
          <RegionDetailPanel
            region={selectedRegion}
            railwayRegions={railwayRegions}
            network={network}
            range={validatedRange}
            focusedDst={focusedDst}
            setRange={setRange}
            setNet={setNet}
            setDst={setDst}
            onClose={closePanel}
          />
        )}
      </Box>
    </Flex>
  );
}
