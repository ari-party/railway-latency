import { Box, Code, Stack, Text } from '@chakra-ui/react';

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
        color="fg.muted"
        fontSize="2xs"
        letterSpacing="wide"
        marginBottom="1"
        textTransform="uppercase"
      >
        {label}
      </Text>
      {children}
    </Box>
  );
}

function TimingSection({ detail }: { detail: CheckEventDetailRow }) {
  return (
    <Section label="timing">
      <Text fontFamily="mono">
        dns {detail.dns_ms ?? '—'} · handshake {detail.handshake_ms ?? '—'} ·
        http {detail.http_ms ?? '—'}
      </Text>
    </Section>
  );
}

function HeadersSection({ detail }: { detail: CheckEventDetailRow }) {
  const entries = Object.entries(detail.headers);
  return (
    <Section label="response headers">
      <Stack fontFamily="mono" gap="0.5">
        {entries.length === 0 && (
          <Text color="fg.muted">— none captured (2xx) —</Text>
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
        bg="bg.muted"
        color="fg"
        fontSize="2xs"
        padding="2"
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
