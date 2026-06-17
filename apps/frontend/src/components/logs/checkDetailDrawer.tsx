import { Box, Code, HStack, Stack, Text } from '@chakra-ui/react';

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

function Metric({ label, ms }: { label: string; ms: number | null }) {
  return (
    <Stack gap="0.5">
      <Text
        fontSize="2xs"
        fontWeight="semibold"
        letterSpacing="0.07em"
        textTransform="uppercase"
        color="fg.subtle"
      >
        {label}
      </Text>
      <HStack gap="1" align="baseline" fontFamily="mono">
        <Text color="fg" fontSize="md">
          {ms == null ? '..' : Math.round(ms)}
        </Text>
        <Text fontSize="xs" color="fg.muted">
          ms
        </Text>
      </HStack>
    </Stack>
  );
}

function TimingSection({ detail }: { detail: CheckEventDetailRow }) {
  return (
    <Section label="timing">
      <HStack gap="8">
        <Metric label="DNS" ms={detail.dns_ms ?? null} />
        <Metric label="Handshake" ms={detail.handshake_ms ?? null} />
        <Metric label="HTTP" ms={detail.http_ms ?? null} />
      </HStack>
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
          <DrawerTitle fontFamily="mono">
            {src} → {dst} · {network}
          </DrawerTitle>
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
            <Stack fontSize="xs" gap="4">
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
