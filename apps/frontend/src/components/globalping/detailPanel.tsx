import { Box, Flex, HStack, IconButton, Stack, Text } from '@chakra-ui/react';
import { LuX } from 'react-icons/lu';

import { StatusDot } from '@/components/fleet/probeStatus';

import type {
  GlobalpingMtrHop,
  GlobalpingProbeResult,
} from '@/server/api/trpc/routers/globalping/types';

const HOP_GRID = '2rem minmax(0, 1fr) 4rem 4rem';

function formatMs(value: number | null | undefined): string {
  return value == null ? '—' : `${Math.round(value)} ms`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <HStack justify="space-between" gap="6">
      <Text fontSize="xs" color="fg.subtle">
        {label}
      </Text>
      <Text fontSize="xs" fontFamily="mono">
        {value}
      </Text>
    </HStack>
  );
}

function HttpDetail({ entry }: { entry: GlobalpingProbeResult }) {
  return (
    <Stack gap="4">
      <Stack gap="1.5">
        <Text
          fontSize="2xs"
          textTransform="uppercase"
          letterSpacing="0.06em"
          color="fg.subtle"
        >
          Routing
        </Text>
        <Row label="Hikari PoP" value={entry.hikariPop ?? '—'} />
        <Row label="Edge zone" value={entry.railwayEdge ?? '—'} />
        <Row label="Cloudflare PoP" value={entry.cfPop ?? '—'} />
        <Row
          label="Status"
          value={
            entry.statusCode != null ? String(entry.statusCode) : entry.status
          }
        />
      </Stack>

      <Stack gap="1.5">
        <Text
          fontSize="2xs"
          textTransform="uppercase"
          letterSpacing="0.06em"
          color="fg.subtle"
        >
          Timings
        </Text>
        <Row label="DNS" value={formatMs(entry.timings?.dns)} />
        <Row label="TCP" value={formatMs(entry.timings?.tcp)} />
        <Row label="TLS" value={formatMs(entry.timings?.tls)} />
        <Row label="First byte" value={formatMs(entry.timings?.firstByte)} />
        <Row label="Total" value={formatMs(entry.timings?.total)} />
      </Stack>
    </Stack>
  );
}

function HopRow({ hop, index }: { hop: GlobalpingMtrHop; index: number }) {
  return (
    <Box
      display="grid"
      gridTemplateColumns={HOP_GRID}
      gap="2"
      alignItems="center"
      paddingY="1"
    >
      <Text fontFamily="mono" fontSize="xs" color="fg.subtle">
        {index + 1}
      </Text>
      <Text fontFamily="mono" fontSize="xs" truncate>
        {hop.resolvedAddress ?? '*'}
        {hop.resolvedHostname ? ` (${hop.resolvedHostname})` : ''}
      </Text>
      <Text fontFamily="mono" fontSize="xs" textAlign="right">
        {formatMs(hop.avg)}
      </Text>
      <Text
        fontFamily="mono"
        fontSize="xs"
        textAlign="right"
        color={hop.loss ? 'fg' : 'fg.subtle'}
      >
        {hop.loss == null ? '—' : `${hop.loss}%`}
      </Text>
    </Box>
  );
}

function MtrDetail({ entry }: { entry: GlobalpingProbeResult }) {
  const hops = entry.hops ?? [];
  if (hops.length === 0)
    return (
      <Text color="fg.muted" fontSize="sm">
        No hops returned for this probe.
      </Text>
    );

  return (
    <Stack gap="0">
      <Box
        display="grid"
        gridTemplateColumns={HOP_GRID}
        gap="2"
        paddingBottom="2"
        borderBottomWidth="1px"
        borderColor="border.muted"
      >
        {['Hop', 'Address', 'Avg', 'Loss'].map((heading, i) => (
          <Text
            key={heading}
            fontSize="2xs"
            textTransform="uppercase"
            letterSpacing="0.06em"
            color="fg.subtle"
            textAlign={i >= 2 ? 'right' : 'left'}
          >
            {heading}
          </Text>
        ))}
      </Box>
      {hops.map((hop, index) => (
        <HopRow
          key={`${index}-${hop.resolvedAddress ?? 'x'}`}
          hop={hop}
          index={index}
        />
      ))}
    </Stack>
  );
}

export function GlobalpingDetailPanel({
  entry,
  onClose,
}: {
  entry: GlobalpingProbeResult;
  onClose: () => void;
}) {
  return (
    <Stack
      position="absolute"
      top="0"
      right="0"
      bottom="0"
      zIndex={10}
      width={{ base: '100%', md: '380px' }}
      minHeight="0"
      gap="0"
      borderLeftWidth="1px"
      borderColor="border.muted"
      bg="bg.subtle"
      boxShadow="-16px 0 40px rgba(0, 0, 0, 0.5)"
    >
      <Flex
        align="center"
        gap="2.5"
        paddingX="4"
        paddingY="3"
        borderBottomWidth="1px"
        borderColor="border.muted"
      >
        <IconButton
          size="sm"
          variant="ghost"
          color="fg.muted"
          aria-label="Close panel"
          flexShrink={0}
          _hover={{ color: 'fg', bg: 'bg.emphasized' }}
          onClick={onClose}
        >
          <LuX />
        </IconButton>

        <HStack gap="2.5" minWidth="0">
          <StatusDot
            status={entry.status === 'failed' ? 'down' : 'green'}
            size={9}
          />
          <Stack gap="0" minWidth="0">
            <Text fontFamily="mono" fontWeight="semibold" color="fg" truncate>
              {entry.probe.city}, {entry.probe.country}
            </Text>
            <Text fontSize="xs" color="fg.muted" truncate>
              AS{entry.probe.asn} · {entry.probe.network}
            </Text>
          </Stack>
        </HStack>
      </Flex>

      <Box
        flex="1"
        minHeight="0"
        overflowY="auto"
        overflowX="hidden"
        paddingX="5"
        paddingY="4"
      >
        {entry.hops ? (
          <MtrDetail entry={entry} />
        ) : (
          <HttpDetail entry={entry} />
        )}
      </Box>
    </Stack>
  );
}
