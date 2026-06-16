import { Box, Input, Stack, Text } from '@chakra-ui/react';
import { cityNameFromProbeId } from '@railway-latency/utils';
import React from 'react';

import { filterProbes, groupProbes } from '@/utils/probeList';

import type { ProbeMetadata, ProbeStatus } from '@railway-latency/types';

const STATUS_COLOR: Record<ProbeStatus, string> = {
  green: '#22c55e',
  stale: '#f59e0b',
  down: '#ef4444',
  inactive: '#6b7280',
};

export function ProbeSidebar({
  onSelect,
  probes,
  selectedProbeId,
}: {
  onSelect: (probeId: string) => void;
  probes: ProbeMetadata[];
  selectedProbeId: string | null;
}) {
  const [query, setQuery] = React.useState('');
  const groups = React.useMemo(
    () => groupProbes(filterProbes(probes, query)),
    [probes, query],
  );

  return (
    <Stack
      width="220px"
      flexShrink={0}
      borderRightWidth="1px"
      borderColor="gray.200"
      height="100%"
      overflowY="auto"
      padding={2}
      gap={2}
    >
      <Input
        size="sm"
        placeholder="Search probes…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      {groups.length === 0 && (
        <Text fontSize="sm" color="fg.muted" padding={2}>
          No probes.
        </Text>
      )}

      {groups.map(({ group, probes: groupProbesList }) => (
        <Box key={group}>
          <Text
            fontSize="xs"
            textTransform="uppercase"
            color="fg.muted"
            paddingX={2}
            paddingY={1}
          >
            {group}
          </Text>
          {groupProbesList.map((probe) => {
            const cityName = cityNameFromProbeId(probe.probeId);

            return (
              <Box
                as="button"
                key={probe.probeId}
                display="flex"
                alignItems="center"
                gap={2}
                width="100%"
                textAlign="left"
                paddingX={2}
                paddingY={1}
                borderRadius="md"
                bg={probe.probeId === selectedProbeId ? 'blue.50' : undefined}
                _hover={{ bg: 'gray.100' }}
                onClick={() => onSelect(probe.probeId)}
              >
                <Box
                  width="7px"
                  height="7px"
                  borderRadius="full"
                  backgroundColor={STATUS_COLOR[probe.status]}
                  flexShrink={0}
                />
                <Stack gap={0} minWidth={0}>
                  <Text fontSize="sm" color="fg" truncate>
                    {probe.probeId}
                  </Text>
                  {cityName && (
                    <Text fontSize="xs" color="fg.muted" truncate>
                      {cityName}
                    </Text>
                  )}
                </Stack>
              </Box>
            );
          })}
        </Box>
      ))}
    </Stack>
  );
}
