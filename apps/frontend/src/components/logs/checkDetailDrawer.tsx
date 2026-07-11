import { Box, Code, HStack, Stack, Text } from '@chakra-ui/react';

import {
  DetailSection,
  HeaderList,
  TimingLabel,
  TimingValue,
  WaterfallRow,
} from '@/components/detailSections';
import {
  checkStatusLabel,
  STATUS_TONE_BG,
  STATUS_TONE_COLOR,
} from '@/components/logs/checkStatus';
import {
  DrawerBackdrop,
  DrawerBody,
  DrawerCloseTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerRoot,
  DrawerTitle,
} from '@/components/ui/drawer';
import { trpc } from '@/utils/trpc';

import type { CheckEventDetailRow } from '@railway-latency/types';

function StatusBadge({
  failStage,
  httpStatus,
}: {
  failStage: string;
  httpStatus: number | null;
}) {
  const status = checkStatusLabel({ failStage, httpStatus });
  return (
    <Box
      as="span"
      flexShrink={0}
      paddingX="1.5"
      paddingY="0.5"
      borderRadius="sm"
      fontFamily="mono"
      fontSize="xs"
      fontWeight="medium"
      color={STATUS_TONE_COLOR[status.tone]}
      bg={STATUS_TONE_BG[status.tone]}
    >
      {status.text}
    </Box>
  );
}

function TimingSection({ detail }: { detail: CheckEventDetailRow }) {
  const dns = detail.dns_ms ?? 0;
  const handshake = detail.handshake_ms ?? 0;
  const http = detail.http_ms ?? 0;
  const total = dns + handshake + http;
  return (
    <DetailSection label="timing (ms)">
      <Stack gap="2">
        <WaterfallRow
          label="DNS"
          ms={detail.dns_ms}
          color="pink.400"
          start={0}
          total={total}
        />
        <WaterfallRow
          label="Handshake"
          ms={detail.handshake_ms}
          color="teal.400"
          start={dns}
          total={total}
        />
        <WaterfallRow
          label="HTTP"
          ms={detail.http_ms}
          color="blue.400"
          start={dns + handshake}
          total={total}
        />
        <HStack gap="3" marginTop="1">
          <TimingLabel>Total</TimingLabel>
          <Box flex="1" />
          <TimingValue ms={total} color="fg.muted" />
        </HStack>
      </Stack>
    </DetailSection>
  );
}

function HeadersSection({ detail }: { detail: CheckEventDetailRow }) {
  return (
    <DetailSection label="response headers">
      <HeaderList headers={detail.headers} />
    </DetailSection>
  );
}

function BodySection({ detail }: { detail: CheckEventDetailRow }) {
  if (!detail.body) return null;
  const sectionLabel = detail.body_truncated
    ? 'response body (truncated)'
    : 'response body';
  return (
    <DetailSection label={sectionLabel}>
      <Code
        display="block"
        bg="bg"
        color="fg"
        fontSize="2xs"
        padding="3"
        borderWidth="1px"
        borderColor="border.muted"
        borderRadius="md"
        whiteSpace="pre-wrap"
        width="100%"
      >
        {detail.body}
      </Code>
    </DetailSection>
  );
}

export function CheckDetailDrawer({
  onClose,
  selectedKey,
}: {
  selectedKey: string;
  onClose: () => void;
}) {
  const [timePart, src, dst, networkPart] = selectedKey.split(':');
  const time = Number(timePart);
  const network = (['private', 'public', 'proxied'] as const).find(
    (value) => value === networkPart,
  );
  const isValidKey =
    Number.isInteger(time) && Boolean(src) && Boolean(dst) && Boolean(network);

  const {
    data: detail,
    isError,
    isLoading,
  } = trpc.checks.detail.useQuery(
    { dst, network: network as 'private' | 'public' | 'proxied', src, time },
    { enabled: isValidKey },
  );

  const timestamp = Number.isInteger(time)
    ? new Date(time).toLocaleString(undefined, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })
    : '';

  return (
    <DrawerRoot
      open
      size="md"
      onOpenChange={(event) => {
        if (!event.open) onClose();
      }}
    >
      <DrawerBackdrop />
      <DrawerContent>
        <DrawerHeader paddingEnd="12">
          <Stack gap="2" flex="1" minWidth="0">
            <HStack gap="2.5" minWidth="0">
              {detail && (
                <StatusBadge
                  failStage={detail.fail_stage}
                  httpStatus={detail.http_status}
                />
              )}
              <DrawerTitle
                fontFamily="mono"
                fontSize="sm"
                fontWeight="semibold"
                whiteSpace="nowrap"
                overflowX="auto"
                flex="1"
                minWidth="0"
              >
                {src}
                <Box as="span" color="accent" paddingX="1.5">
                  →
                </Box>
                {src === dst ? 'self' : dst}
              </DrawerTitle>
            </HStack>
            <Text
              fontFamily="mono"
              fontSize="xs"
              color="fg.muted"
              wordBreak="break-word"
            >
              {network} · {timestamp}
              {detail?.reason ? ` · ${detail.reason}` : ''}
            </Text>
          </Stack>
        </DrawerHeader>
        <DrawerCloseTrigger />
        <DrawerBody>
          {!isValidKey && (
            <Text color="fg.muted" fontSize="sm">
              This check link is invalid.
            </Text>
          )}
          {isValidKey && isLoading && (
            <Text color="fg.muted" fontSize="sm">
              Loading…
            </Text>
          )}
          {isValidKey && !isLoading && (isError || !detail) && (
            <Text color="fg.muted" fontSize="sm">
              Detail unavailable.
            </Text>
          )}
          {isValidKey && !isLoading && !isError && detail && (
            <Stack fontSize="xs" gap="5">
              <TimingSection detail={detail} />
              <HeadersSection detail={detail} />
              <BodySection detail={detail} />
            </Stack>
          )}
        </DrawerBody>
      </DrawerContent>
    </DrawerRoot>
  );
}
