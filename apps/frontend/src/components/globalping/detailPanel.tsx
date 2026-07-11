import { Box, HStack, Stack, Text } from '@chakra-ui/react';

import { CloseButton } from '@/components/ui/close-button';

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
    <Box
      position="absolute"
      top="0"
      right="0"
      bottom="0"
      width={{ base: '100%', md: '380px' }}
      bg="bg.panel"
      borderLeftWidth="1px"
      borderColor="border.DEFAULT"
      boxShadow="-8px 0 28px rgba(0, 0, 0, 0.45)"
      overflow="auto"
      padding="5"
      zIndex={5}
    >
      <HStack justify="space-between" align="start" marginBottom="4">
        <Stack gap="0.5">
          <Text fontWeight="semibold">
            {entry.probe.city}, {entry.probe.country}
          </Text>
          <Text fontSize="xs" color="fg.muted">
            AS{entry.probe.asn} · {entry.probe.network}
          </Text>
        </Stack>
        <CloseButton size="sm" onClick={onClose} />
      </HStack>

      {entry.hops ? <MtrDetail entry={entry} /> : <HttpDetail entry={entry} />}
    </Box>
  );
}
