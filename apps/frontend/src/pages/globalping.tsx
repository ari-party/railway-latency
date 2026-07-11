import { Box, ClientOnly, Flex, Stack, Text } from '@chakra-ui/react';
import React from 'react';

import { GlobalpingControls } from '@/components/globalping/controls';
import { GlobalpingDetailPanel } from '@/components/globalping/detailPanel';
import { GlobalpingMap } from '@/components/globalping/map';
import { GlobalpingRecentList } from '@/components/globalping/recentList';
import { env } from '@/env';
import { trpc } from '@/utils/trpc';

import type { GlobalpingControlsValue } from '@/components/globalping/controls';
import type { GlobalpingResult } from '@/server/api/trpc/routers/globalping/types';
import type { GetServerSideProps } from 'next';

interface PageProps {
  railwayRegions: string[];
}

export const getServerSideProps: GetServerSideProps<PageProps> = async () => {
  return { props: { railwayRegions: env.RAILWAY_REPLICA_REGIONS ?? [] } };
};

function AuthedGlobalping({ railwayRegions }: PageProps) {
  const utils = trpc.useUtils();
  const locations = trpc.globalping.locations.useQuery(undefined, {
    staleTime: 60 * 1_000,
  });
  const recent = trpc.globalping.list.useQuery();

  const [controls, setControls] = React.useState<GlobalpingControlsValue>({
    dst: railwayRegions[0] ?? '',
    limit: 10,
    location: {},
    type: 'http',
  });
  const [activeResult, setActiveResult] =
    React.useState<GlobalpingResult | null>(null);
  const [selectedProbeIndex, setSelectedProbeIndex] = React.useState<
    number | null
  >(null);

  const measure = trpc.globalping.measure.useMutation({
    onSuccess: (result) => {
      setActiveResult(result);
      setSelectedProbeIndex(null);
      void utils.globalping.list.invalidate();
    },
  });

  const loadRun = React.useCallback(
    async (id: string) => {
      try {
        const result = await utils.globalping.get.fetch({ id });
        if (result) {
          setActiveResult(result);
          setSelectedProbeIndex(null);
        }
      } catch {
        // Best effort
      }
    },
    [utils],
  );

  const tree = locations.data ?? { continents: [] };
  const selectedEntry =
    selectedProbeIndex == null
      ? null
      : (activeResult?.probes[selectedProbeIndex] ?? null);

  return (
    <Stack height="100%" gap="0">
      <GlobalpingControls
        regions={railwayRegions}
        tree={tree}
        value={controls}
        running={measure.isPending}
        onChange={setControls}
        onRun={() =>
          measure.mutate({
            type: controls.type,
            dst: controls.dst,
            location: controls.location,
            limit: controls.limit,
          })
        }
      />

      {measure.error && (
        <Box paddingX="6" paddingY="2" bg="red.subtle">
          <Text fontSize="sm" color="red.fg">
            {measure.error.message}
          </Text>
        </Box>
      )}

      <Flex flex="1" minHeight={0} position="relative">
        <Box
          width="240px"
          flexShrink={0}
          borderRightWidth="1px"
          borderColor="border.muted"
          bg="bg.subtle"
          overflow="auto"
          display={{ base: 'none', lg: 'block' }}
        >
          <GlobalpingRecentList
            runs={recent.data ?? []}
            activeId={activeResult?.id ?? null}
            onSelect={(id) => void loadRun(id)}
          />
        </Box>

        <Box flex="1" minWidth={0} position="relative" overflow="hidden">
          <ClientOnly fallback={null}>
            <GlobalpingMap
              result={activeResult}
              selectedIndex={selectedProbeIndex}
              onSelectProbe={setSelectedProbeIndex}
            />
          </ClientOnly>

          {selectedEntry && (
            <GlobalpingDetailPanel
              entry={selectedEntry}
              onClose={() => setSelectedProbeIndex(null)}
            />
          )}
        </Box>
      </Flex>
    </Stack>
  );
}

export default function GlobalpingPage({ railwayRegions }: PageProps) {
  const session = trpc.session.useQuery();

  if (!session.data) return null;

  if (!session.data.enabled || !session.data.user)
    return (
      <Flex
        height="100%"
        align="center"
        justify="center"
        direction="column"
        gap="2"
      >
        <Text fontWeight="medium">Sign-in required</Text>
        <Text fontSize="sm" color="fg.muted">
          Globalping measurements are available to signed-in users.
        </Text>
      </Flex>
    );

  return <AuthedGlobalping railwayRegions={railwayRegions} />;
}
