import { Box, ClientOnly } from '@chakra-ui/react';
import React from 'react';

import { LatencyMap } from '@/components/map/latencyMap';
import { railwayMarkersFromRegions } from '@/components/map/markers';
import { env } from '@/env';
import { trpc } from '@/utils/trpc';

import type { GetServerSideProps } from 'next';

interface MapPageProps {
  railwayRegions: string[];
}

export const getServerSideProps: GetServerSideProps<
  MapPageProps
> = async () => {
  return { props: { railwayRegions: env.RAILWAY_REPLICA_REGIONS ?? [] } };
};

export default function MapPage({ railwayRegions }: MapPageProps) {
  const [probes] = trpc.probes.list.useSuspenseQuery(undefined, {
    refetchInterval: 30 * 1_000,
  });
  const [initialLatency] = trpc.table.data.useSuspenseQuery();
  const [latency, setLatency] = React.useState(initialLatency);
  trpc.table.onChange.useSubscription(undefined, { onData: setLatency });

  React.useEffect(() => {
    setLatency(initialLatency);
  }, [initialLatency]);

  const regions = railwayMarkersFromRegions(railwayRegions);

  return (
    <Box width="100%" height="100%">
      <ClientOnly fallback={null}>
        <LatencyMap regions={regions} probes={probes} latency={latency} />
      </ClientOnly>
    </Box>
  );
}
