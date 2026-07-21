import { Badge, Box, HStack, Stack, Text } from '@chakra-ui/react';

import type { GlobalpingSummary } from '@/server/api/trpc/routers/globalping/types';

function locationLabel(location: GlobalpingSummary['location']): string {
  return (
    location.city ??
    location.country ??
    location.continent ??
    location.network ??
    'anywhere'
  );
}

export function GlobalpingRecentList({
  activeId,
  onSelect,
  runs,
}: {
  runs: GlobalpingSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  if (runs.length === 0)
    return (
      <Text fontSize="sm" color="fg.muted" padding="4">
        No measurements yet.
      </Text>
    );

  return (
    <Stack gap="1" padding="2">
      {runs.map((run) => {
        const active = run.id === activeId;
        return (
          <Box
            key={run.id}
            as="button"
            textAlign="left"
            borderRadius="md"
            paddingX="3"
            paddingY="2"
            bg={active ? 'bg.emphasized' : 'transparent'}
            _hover={{ bg: 'bg.emphasized' }}
            onClick={() => onSelect(run.id)}
          >
            <HStack justify="space-between" marginBottom="0.5">
              <Badge
                size="sm"
                colorPalette={run.type === 'http' ? 'purple' : 'teal'}
              >
                {run.type.toUpperCase()}
              </Badge>
              <Text fontSize="2xs" color="fg.subtle">
                {new Date(run.createdAt).toLocaleTimeString()}
              </Text>
            </HStack>
            <Text fontSize="xs" fontFamily="mono" truncate>
              {run.dst}
            </Text>
            <Text fontSize="2xs" color="fg.muted">
              {locationLabel(run.location)} · {run.probeCount} probes
            </Text>
          </Box>
        );
      })}
    </Stack>
  );
}
