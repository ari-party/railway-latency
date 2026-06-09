import {
  Accordion,
  Badge,
  Box,
  Heading,
  HStack,
  Stack,
  Text,
} from '@chakra-ui/react';
import React from 'react';

import { AlertDetails } from '@/components/alertDetails';
import { SEVERITY_PALETTE, worstSeverity } from '@/utils/alerts';
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

  const byComponent = new Map<string, Alert[]>();
  for (const alert of alerts) {
    const key = componentKey(alert.src, alert.dst, alert.network);
    byComponent.set(key, [...(byComponent.get(key) ?? []), alert]);
  }

  const counts = severityCounts(alerts);

  return (
    <Box padding={6} maxWidth="5xl" marginX="auto">
      <HStack justify="space-between" marginBottom={6}>
        <Heading size="lg">/alerts</Heading>
        <Text color="fg.muted">
          {alerts.length === 0
            ? 'all clear'
            : `● ${counts.critical} critical · ${counts.high} high · ${counts.warning} warning`}
        </Text>
      </HStack>

      <Stack gap={8}>
        {NETWORKS.map((network) => (
          <Stack key={network} gap={2}>
            <Heading size="sm" textTransform="uppercase" color="fg.muted">
              {network}
            </Heading>

            <Accordion.Root multiple collapsible lazyMount unmountOnExit>
              {regions.flatMap((src) =>
                regions.map((dst) => {
                  const key = componentKey(src, dst, network);
                  const componentAlerts = byComponent.get(key) ?? [];
                  const severity = worstSeverity(componentAlerts);

                  return (
                    <Accordion.Item key={key} value={key}>
                      <Accordion.ItemTrigger>
                        <HStack
                          flex="1"
                          justify="space-between"
                          paddingRight={3}
                        >
                          <Text fontSize="sm">
                            {src} → {dst}
                          </Text>
                          {severity ? (
                            <Badge colorPalette={SEVERITY_PALETTE[severity]}>
                              {severity}
                            </Badge>
                          ) : (
                            <Text fontSize="sm" color="fg.subtle">
                              ✓
                            </Text>
                          )}
                        </HStack>
                        <Accordion.ItemIndicator />
                      </Accordion.ItemTrigger>

                      <Accordion.ItemContent>
                        <Accordion.ItemBody>
                          {componentAlerts.length > 0 ? (
                            <AlertDetails alerts={componentAlerts} />
                          ) : (
                            <Text fontSize="sm" color="fg.muted">
                              all good
                            </Text>
                          )}
                        </Accordion.ItemBody>
                      </Accordion.ItemContent>
                    </Accordion.Item>
                  );
                }),
              )}
            </Accordion.Root>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}
