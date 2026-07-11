import { Box, Flex, HStack, IconButton, Stack, Text } from '@chakra-ui/react';
import { LuX } from 'react-icons/lu';

import {
  DetailCard,
  DetailSection,
  HeaderList,
  TimingLabel,
  TimingValue,
  WaterfallRow,
} from '@/components/detailSections';
import { StatusDot } from '@/components/fleet/probeStatus';
import { MtrHopTable } from '@/components/mtrHopTable';

import type {
  GlobalpingHttpTimings,
  GlobalpingProbeResult,
} from '@/server/api/trpc/routers/globalping/types';

function TimingWaterfall({
  timings,
}: {
  timings: GlobalpingHttpTimings | null | undefined;
}) {
  const dns = timings?.dns ?? 0;
  const tcp = timings?.tcp ?? 0;
  const tls = timings?.tls ?? 0;
  const firstByte = timings?.firstByte ?? 0;
  const download = timings?.download ?? 0;
  const total = dns + tcp + tls + firstByte + download;

  return (
    <DetailSection label="timing (ms)">
      <Stack gap="2">
        <WaterfallRow
          label="DNS"
          ms={timings?.dns ?? null}
          color="pink.400"
          start={0}
          total={total}
        />
        <WaterfallRow
          label="TCP"
          ms={timings?.tcp ?? null}
          color="teal.400"
          start={dns}
          total={total}
        />
        <WaterfallRow
          label="TLS"
          ms={timings?.tls ?? null}
          color="cyan.400"
          start={dns + tcp}
          total={total}
        />
        <WaterfallRow
          label="TTFB"
          ms={timings?.firstByte ?? null}
          color="blue.400"
          start={dns + tcp + tls}
          total={total}
        />
        <WaterfallRow
          label="Download"
          ms={timings?.download ?? null}
          color="purple.400"
          start={dns + tcp + tls + firstByte}
          total={total}
        />
        <HStack gap="3" marginTop="1">
          <TimingLabel>Total</TimingLabel>
          <Box flex="1" />
          <TimingValue ms={timings?.total ?? total} color="fg.muted" />
        </HStack>
      </Stack>
    </DetailSection>
  );
}

function HttpDetail({ entry }: { entry: GlobalpingProbeResult }) {
  return (
    <Stack fontSize="xs" gap="4">
      <DetailCard>
        <TimingWaterfall timings={entry.timings} />
      </DetailCard>

      <DetailCard>
        <DetailSection label="response headers">
          <HeaderList headers={entry.headers ?? {}} />
        </DetailSection>
      </DetailCard>
    </Stack>
  );
}

function MtrDetail({ entry }: { entry: GlobalpingProbeResult }) {
  const hops = (entry.hops ?? []).map((hop, index) => ({
    hop: index + 1,
    ip: hop.resolvedAddress ?? undefined,
    ms: hop.avg ?? undefined,
  }));

  return (
    <DetailCard>
      <DetailSection label="mtr">
        {hops.length === 0 ? (
          <Text color="fg.muted" fontSize="sm">
            No hops returned for this probe.
          </Text>
        ) : (
          <MtrHopTable hops={hops} sourceAsn={String(entry.probe.asn)} />
        )}
      </DetailSection>
    </DetailCard>
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
      width={{ base: '100%', md: 'min(640px, 46vw)' }}
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
