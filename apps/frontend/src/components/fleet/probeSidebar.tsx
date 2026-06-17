import { Box, Input, Stack, Text } from '@chakra-ui/react';
import { cityNameFromProbeId } from '@railway-latency/utils';
import React from 'react';

import { StatusDot } from '@/components/fleet/probeStatus';
import { filterProbes, groupProbes } from '@/utils/probeList';

import type { ProbeMetadata } from '@railway-latency/types';

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
      width="272px"
      flexShrink={0}
      borderRightWidth="1px"
      borderColor="border.muted"
      bg="bg.subtle"
      height="100%"
      gap="3"
      padding="3"
      minHeight="0"
    >
      <Text fontSize="sm" fontWeight="semibold" color="fg">
        Probes
      </Text>

      <Input
        size="sm"
        bg="bg"
        borderColor="border.DEFAULT"
        borderRadius="md"
        placeholder="Search probes"
        _placeholder={{ color: 'fg.subtle' }}
        _focusVisible={{ borderColor: 'accent', boxShadow: 'none' }}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />

      <Stack gap="3" overflowY="auto" flex="1" minHeight="0">
        {groups.length === 0 && (
          <Text fontSize="sm" color="fg.muted" padding="2">
            No probes.
          </Text>
        )}

        {groups.map(({ group, probes: groupProbesList }) => (
          <Stack key={group} gap="0.5">
            <Text
              fontSize="2xs"
              fontWeight="semibold"
              letterSpacing="0.07em"
              textTransform="uppercase"
              color="fg.subtle"
              paddingX="2"
              paddingY="1"
            >
              {group}
            </Text>

            {groupProbesList.map((probe) => {
              const cityName = cityNameFromProbeId(probe.probeId);
              const selected = probe.probeId === selectedProbeId;

              return (
                <Box
                  as="button"
                  key={probe.probeId}
                  display="flex"
                  alignItems="center"
                  gap="2.5"
                  width="100%"
                  textAlign="left"
                  paddingX="2"
                  paddingY="1.5"
                  borderRadius="md"
                  bg={selected ? 'accent.subtle' : undefined}
                  transition="background 0.12s ease"
                  _hover={{ bg: selected ? 'accent.subtle' : 'bg.emphasized' }}
                  onClick={() => onSelect(probe.probeId)}
                >
                  <StatusDot status={probe.status} />
                  <Stack gap="0" minWidth="0">
                    <Text
                      fontFamily="mono"
                      fontSize="sm"
                      color={selected ? 'accent' : 'fg'}
                      fontWeight={selected ? 'semibold' : 'normal'}
                      truncate
                    >
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
          </Stack>
        ))}
      </Stack>
    </Stack>
  );
}
