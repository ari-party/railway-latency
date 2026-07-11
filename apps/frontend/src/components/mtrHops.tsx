import { ClientOnly, Skeleton, Stack, Text } from '@chakra-ui/react';
import React, { Suspense } from 'react';

import { MtrHopTable } from '@/components/mtrHopTable';
import { trpc } from '@/utils/trpc';

import type { Network } from '@railway-latency/types';

const REFETCH_INTERVAL_MS = 5_000;

function MtrHopsSkeleton() {
  return (
    <Skeleton backgroundColor="bg.subtle" borderRadius="lg" height="200px" />
  );
}

function MtrHopsContent({
  dst,
  network,
  src,
}: {
  dst: string;
  network: 'public' | 'proxied';
  src: string;
}) {
  const [result] = trpc.mtr.latest.useSuspenseQuery(
    { src, dst, network },
    { refetchInterval: REFETCH_INTERVAL_MS },
  );
  const [probes] = trpc.probes.list.useSuspenseQuery();

  if (!result || result.hops.length === 0)
    return (
      <Text color="fg.muted" paddingY="6" textAlign="center">
        No MTR data for this path.
      </Text>
    );

  const sourceAsn = probes.find((p) => p.probeId === src)?.asn ?? null;

  return (
    <Stack gap="2">
      <Text fontSize="xs" color="fg.muted">
        Path as of {new Date(result.time).toLocaleTimeString()}
      </Text>

      <MtrHopTable hops={result.hops} sourceAsn={sourceAsn} />
    </Stack>
  );
}

export function MtrHops({
  dst,
  network,
  src,
}: {
  dst: string;
  network: Network;
  src: string;
}) {
  if (network === 'private')
    return (
      <Text color="fg.muted" paddingY="6" textAlign="center">
        MTR is not collected on the private network.
      </Text>
    );

  return (
    <ClientOnly fallback={<MtrHopsSkeleton />}>
      <Suspense fallback={<MtrHopsSkeleton />}>
        <MtrHopsContent src={src} dst={dst} network={network} />
      </Suspense>
    </ClientOnly>
  );
}
