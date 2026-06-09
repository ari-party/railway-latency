import { Box, Stack, Text } from '@chakra-ui/react';
import React, { Suspense } from 'react';

import { Sparkline } from '@/components/sparkline';
import { formatRelative } from '@/utils/format';

import type { Alert } from '@/utils/alerts';
import type { Network } from '@railway-latency/types';

const KIND_LABEL = {
  latency: 'latency',
  inversion: 'inversion',
  edge: 'edge',
  cfPop: 'cf pop',
  hikariPop: 'hikari pop',
} as const;

function LatencyRow({ alert }: { alert: Alert }) {
  return (
    <Stack gap={1}>
      <Text fontSize="sm">
        latency · median <b>{alert.current}ms</b> &gt; limit {alert.limit}ms
      </Text>
      <Box height="56px" width="100%" maxWidth="360px">
        <Suspense fallback={null}>
          <Sparkline
            src={alert.src}
            dst={alert.dst}
            network={alert.network as Network}
          />
        </Suspense>
      </Box>
    </Stack>
  );
}

function InversionRow({ alert }: { alert: Alert }) {
  return (
    <Text fontSize="sm">
      network inversion · public <b>{alert.current}ms</b> &lt; private{' '}
      {alert.limit}ms
    </Text>
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

export function AlertDetails({ alerts }: { alerts: Alert[] }) {
  return (
    <Stack gap={3}>
      {alerts.map((alert) => {
        if (alert.kind === 'latency')
          return <LatencyRow key={alert.kind} alert={alert} />;
        if (alert.kind === 'inversion')
          return <InversionRow key={alert.kind} alert={alert} />;
        return <RoutingRow key={alert.kind} alert={alert} />;
      })}
    </Stack>
  );
}
