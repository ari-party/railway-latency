import { Box, Heading, HStack, Stack, Text, Wrap } from '@chakra-ui/react';
import React from 'react';

import { AlertCard } from '@/components/alertCard';
import { useAlertDismissal } from '@/utils/alerts';
import { NETWORKS } from '@/utils/query';
import { trpc } from '@/utils/trpc';

import type { Alert } from '@/utils/alerts';

const componentKey = (src: string, dst: string, network: string) =>
  `${src}|${dst}|${network}`;

function severityCounts(alerts: Alert[]) {
  return alerts.reduce(
    (counts, alert) => ({
      ...counts,
      [alert.severity]: counts[alert.severity] + 1,
    }),
    { critical: 0, high: 0, warning: 0 },
  );
}

export default function Alerts() {
  const [regions] = trpc.regions.useSuspenseQuery();
  const [initial] = trpc.alerts.data.useSuspenseQuery();
  const [alerts, setAlerts] = React.useState<Alert[]>([]);

  trpc.alerts.onChange.useSubscription(undefined, { onData: setAlerts });
  React.useEffect(() => setAlerts(initial), [initial]);

  const { dismiss, isDismissed } = useAlertDismissal(alerts);
  const visible = alerts.filter((alert) => !isDismissed(alert));

  const byComponent = new Map<string, Alert[]>();
  for (const alert of visible) {
    const key = componentKey(alert.src, alert.dst, alert.network);
    byComponent.set(key, [...(byComponent.get(key) ?? []), alert]);
  }

  const counts = severityCounts(visible);

  return (
    <Box padding={6} maxWidth="6xl" marginX="auto">
      <HStack justify="space-between" marginBottom={6}>
        <Heading size="lg">/alerts</Heading>
        <Text color="fg.muted">
          {visible.length === 0
            ? 'all clear'
            : `● ${counts.critical} critical · ${counts.high} high · ${counts.warning} warning`}
        </Text>
      </HStack>

      <Stack gap={8}>
        {NETWORKS.map((network) => {
          const cells = regions.flatMap((src) =>
            regions.map((dst) => ({ src, dst })),
          );
          const unhealthy = cells.filter(({ dst, src }) =>
            byComponent.has(componentKey(src, dst, network)),
          );
          const healthy = cells.filter(
            ({ dst, src }) => !byComponent.has(componentKey(src, dst, network)),
          );

          return (
            <Stack key={network} gap={3}>
              <Heading size="sm" textTransform="uppercase" color="fg.muted">
                {network}
              </Heading>

              {unhealthy.length > 0 && (
                <Wrap gap={3}>
                  {unhealthy.map(({ dst, src }) => (
                    <AlertCard
                      key={componentKey(src, dst, network)}
                      src={src}
                      dst={dst}
                      network={network}
                      alerts={byComponent.get(componentKey(src, dst, network))!}
                      onDismiss={() =>
                        byComponent
                          .get(componentKey(src, dst, network))!
                          .forEach(dismiss)
                      }
                    />
                  ))}
                </Wrap>
              )}

              <Wrap gapX={3} gapY={1}>
                {healthy.map(({ dst, src }) => (
                  <Text
                    key={componentKey(src, dst, network)}
                    fontSize="xs"
                    color="fg.subtle"
                  >
                    ✓ {src}→{dst}
                  </Text>
                ))}
              </Wrap>
            </Stack>
          );
        })}
      </Stack>
    </Box>
  );
}
