import { Box, Code, HStack, Stack, Text } from '@chakra-ui/react';

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

function Section({
  children,
  label,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Box>
      <Text
        color="fg.subtle"
        fontSize="2xs"
        fontWeight="semibold"
        letterSpacing="0.07em"
        marginBottom="1.5"
        textTransform="uppercase"
      >
        {label}
      </Text>
      {children}
    </Box>
  );
}

function TimingLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text
      width="5rem"
      flexShrink={0}
      fontSize="2xs"
      fontWeight="semibold"
      letterSpacing="0.07em"
      textTransform="uppercase"
      color="fg.subtle"
    >
      {children}
    </Text>
  );
}

function TimingValue({
  color = 'fg',
  ms,
}: {
  color?: string;
  ms: number | null;
}) {
  return (
    <Text
      width="3.5rem"
      flexShrink={0}
      textAlign="right"
      fontFamily="mono"
      fontSize="xs"
      color={color}
      css={{ fontVariantNumeric: 'tabular-nums' }}
    >
      {ms == null ? '..' : Math.round(ms)}
    </Text>
  );
}

function WaterfallRow({
  color,
  label,
  ms,
  start,
  total,
}: {
  color: string;
  label: string;
  ms: number | null;
  start: number;
  total: number;
}) {
  const left = total > 0 ? (start / total) * 100 : 0;
  const width = total > 0 && ms ? (ms / total) * 100 : 0;
  return (
    <HStack gap="3">
      <TimingLabel>{label}</TimingLabel>
      <Box flex="1" position="relative" height="7px">
        <Box
          position="absolute"
          inset="0"
          borderRadius="full"
          bg="bg.emphasized"
        />
        {width > 0 && (
          <Box
            position="absolute"
            top="0"
            bottom="0"
            left={`${left}%`}
            width={`max(${width}%, 3px)`}
            borderRadius="full"
            bg={color}
          />
        )}
      </Box>
      <TimingValue ms={ms} />
    </HStack>
  );
}

function TimingSection({ detail }: { detail: CheckEventDetailRow }) {
  const dns = detail.dns_ms ?? 0;
  const handshake = detail.handshake_ms ?? 0;
  const http = detail.http_ms ?? 0;
  const total = dns + handshake + http;
  return (
    <Section label="timing (ms)">
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
    </Section>
  );
}

function HeadersSection({ detail }: { detail: CheckEventDetailRow }) {
  const entries = Object.entries(detail.headers);
  return (
    <Section label="response headers">
      <Stack fontFamily="mono" gap="0.5">
        {entries.length === 0 && (
          <Text color="fg.muted">No response headers captured (2xx).</Text>
        )}
        {entries.map(([name, value]) => (
          <Text key={name}>
            <Text as="span" color="accent">
              {name}
            </Text>
            : {value}
          </Text>
        ))}
      </Stack>
    </Section>
  );
}

function BodySection({ detail }: { detail: CheckEventDetailRow }) {
  if (!detail.body) return null;
  const sectionLabel = detail.body_truncated
    ? 'response body (truncated)'
    : 'response body';
  return (
    <Section label={sectionLabel}>
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
    </Section>
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
    ? `${new Date(time).toISOString().slice(0, 19).replace('T', ' ')} UTC`
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
        <DrawerHeader>
          <HStack gap="2.5" minWidth="0">
            {detail && (
              <StatusBadge
                failStage={detail.fail_stage}
                httpStatus={detail.http_status}
              />
            )}
            <DrawerTitle fontFamily="mono" fontWeight="semibold" truncate>
              {src} → {dst}
            </DrawerTitle>
          </HStack>
          <Text
            fontFamily="mono"
            fontSize="xs"
            color="fg.muted"
            marginTop="1.5"
          >
            {network} · {timestamp}
            {detail?.reason ? ` · ${detail.reason}` : ''}
          </Text>
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
