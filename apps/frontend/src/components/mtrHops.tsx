import { Box, ClientOnly, Link, Skeleton, Stack, Text } from '@chakra-ui/react';
import React, { Suspense } from 'react';

import { trpc } from '@/utils/trpc';

import type { MtrHop, Network } from '@railway-latency/types';

const REFETCH_INTERVAL_MS = 5_000;
const GRID_COLUMNS = '2.5rem minmax(0, 1fr) 4.5rem';

function MtrHopsSkeleton() {
  return (
    <Skeleton backgroundColor="bg.subtle" borderRadius="lg" height="200px" />
  );
}

function HeaderRow() {
  return (
    <Box
      display="grid"
      gridTemplateColumns={GRID_COLUMNS}
      gap="3"
      paddingBottom="2"
      borderBottomWidth="1px"
      borderColor="border.muted"
    >
      <Text
        fontSize="2xs"
        textTransform="uppercase"
        letterSpacing="0.06em"
        color="fg.subtle"
      >
        Hop
      </Text>
      <Text
        fontSize="2xs"
        textTransform="uppercase"
        letterSpacing="0.06em"
        color="fg.subtle"
      >
        IP
      </Text>
      <Text
        fontSize="2xs"
        textTransform="uppercase"
        letterSpacing="0.06em"
        color="fg.subtle"
        textAlign="right"
      >
        Latency
      </Text>
    </Box>
  );
}

function HopRow({ hop }: { hop: MtrHop }) {
  return (
    <Box
      display="grid"
      gridTemplateColumns={GRID_COLUMNS}
      gap="3"
      alignItems="center"
      paddingY="1"
    >
      <Text
        fontFamily="mono"
        color="fg.subtle"
        css={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {hop.hop}
      </Text>

      {hop.ip == null ? (
        <Text fontFamily="mono" color="fg.subtle">
          *
        </Text>
      ) : (
        <Link
          href={`https://bgp.tools/prefix/${hop.ip}`}
          target="_blank"
          rel="noopener noreferrer"
          fontFamily="mono"
          color="fg"
          textDecoration="none"
          _hover={{ textDecoration: 'underline', color: 'accent' }}
        >
          {hop.ip}
        </Link>
      )}

      <Text
        textAlign="right"
        fontFamily="mono"
        css={{ fontVariantNumeric: 'tabular-nums' }}
        color={hop.ms == null ? 'fg.subtle' : 'fg'}
      >
        {hop.ms == null ? '..' : `${hop.ms.toFixed(1)} ms`}
      </Text>
    </Box>
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

  if (!result || result.hops.length === 0)
    return (
      <Text color="fg.muted" paddingY="6" textAlign="center">
        No MTR data for this path.
      </Text>
    );

  return (
    <Stack gap="1">
      <Text fontSize="xs" color="fg.muted">
        Path as of {new Date(result.time).toLocaleTimeString()}
      </Text>

      <HeaderRow />

      {result.hops.map((hop, index) => (
        <HopRow key={`${index}-${hop.hop}`} hop={hop} />
      ))}
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
