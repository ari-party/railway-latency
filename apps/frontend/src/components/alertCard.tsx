import { Badge, Box, HStack, Stack, Text } from '@chakra-ui/react';
import React, { Suspense } from 'react';
import { LuX } from 'react-icons/lu';

import { QueryChart } from '@/components/queryChart';
import { formatRelative } from '@/utils/format';

import type { Alert } from '@/utils/alerts';
import type { Network } from '@railway-latency/types';

const SEVERITY_PALETTE = {
  warning: 'yellow',
  high: 'orange',
  critical: 'red',
} as const;

const KIND_LABEL = {
  latency: 'latency',
  edge: 'edge',
  cfPop: 'cf pop',
  hikariPop: 'hikari pop',
} as const;

const SEVERITY_RANK = { warning: 0, high: 1, critical: 2 } as const;

function cardSeverity(alerts: Alert[]): Alert['severity'] {
  return alerts.reduce<Alert['severity']>(
    (worst, alert) =>
      SEVERITY_RANK[alert.severity] > SEVERITY_RANK[worst]
        ? alert.severity
        : worst,
    'warning',
  );
}

function LatencyRow({ alert }: { alert: Alert }) {
  return (
    <Stack gap={1}>
      <Text fontSize="sm">
        latency · median <b>{alert.current}ms</b> &gt; limit {alert.limit}ms
      </Text>
      <Box height="64px" width="280px">
        <Suspense fallback={null}>
          <QueryChart
            src={alert.src}
            dst={alert.dst}
            network={alert.network as Network}
            range="15m"
          />
        </Suspense>
      </Box>
    </Stack>
  );
}

function RoutingRow({ alert }: { alert: Alert }) {
  const expected = Array.isArray(alert.expected)
    ? `[${alert.expected.join(', ')}]`
    : alert.expected;

  return (
    <Stack gap={0.5}>
      <Text fontSize="sm">
        {KIND_LABEL[alert.kind]} · hit <b>{alert.observed}</b> · expected{' '}
        {expected}
      </Text>
      <Text fontSize="xs" color="fg.muted">
        {alert.count} misroutes · first {formatRelative(alert.firstTime!)} ·
        last {formatRelative(alert.lastTime!)}
      </Text>
    </Stack>
  );
}

export function AlertCard({
  alerts,
  dst,
  network,
  onDismiss,
  src,
}: {
  alerts: Alert[];
  dst: string;
  network: string;
  onDismiss: () => void;
  src: string;
}) {
  const palette = SEVERITY_PALETTE[cardSeverity(alerts)];

  return (
    <Box
      borderWidth="1px"
      borderColor={`${palette}.solid`}
      borderRadius="md"
      padding={3}
      width="320px"
      colorPalette={palette}
    >
      <HStack justify="space-between" align="start" marginBottom={2}>
        <Text fontWeight="semibold" fontSize="sm">
          {src} → {dst} · {network}
        </Text>
        <HStack gap={2}>
          <Badge colorPalette={palette} size="sm">
            {cardSeverity(alerts)}
          </Badge>
          <Box
            as="button"
            onClick={onDismiss}
            cursor="pointer"
            color="fg.muted"
          >
            <LuX />
          </Box>
        </HStack>
      </HStack>

      <Stack gap={3}>
        {alerts.map((alert) =>
          alert.kind === 'latency' ? (
            <LatencyRow key={alert.kind} alert={alert} />
          ) : (
            <RoutingRow key={alert.kind} alert={alert} />
          ),
        )}
      </Stack>
    </Box>
  );
}
