import { Box, ClientOnly } from '@chakra-ui/react';
import React from 'react';

import { ProbeMap, railwayMarkersFromRegions } from '@/components/probeMap';
import { env } from '@/env';
import { trpc } from '@/utils/trpc';

import type { GetServerSideProps } from 'next';

interface ProbesPageProps {
  railwayRegions: string[];
}

// RAILWAY_REPLICA_REGIONS is server-only; never import it client-side.
export const getServerSideProps: GetServerSideProps<
  ProbesPageProps
> = async () => {
  return { props: { railwayRegions: env.RAILWAY_REPLICA_REGIONS ?? [] } };
};

export default function ProbesPage({ railwayRegions }: ProbesPageProps) {
  const [external] = trpc.probes.list.useSuspenseQuery(undefined, {
    refetchInterval: 30 * 1_000,
  });
  const railway = railwayMarkersFromRegions(railwayRegions);

  return (
    <Box position="fixed" inset={0} width="100vw" height="100dvh">
      <ClientOnly fallback={null}>
        <ProbeMap external={external} railway={railway} />
      </ClientOnly>
    </Box>
  );
}
