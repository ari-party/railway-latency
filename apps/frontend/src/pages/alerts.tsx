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

const pathKey = (a: string, b: string, network: string) =>
  `${network}|${a}|${b}`;

interface Direction {
  label: string;
  src: string;
  dst: string;
}

function directionsFor(a: string, b: string): Direction[] {
  if (a === b) return [{ label: '', src: a, dst: b }];
  return [
    { label: '→', src: a, dst: b },
    { label: '←', src: b, dst: a },
  ];
}

// Unordered region pairs (a before b), so each path appears once.
function regionPairs(regions: string[]): [string, string][] {
  const pairs: [string, string][] = [];
  for (let i = 0; i < regions.length; i += 1)
    for (let j = i; j < regions.length; j += 1)
      pairs.push([regions[i], regions[j]]);
  return pairs;
}

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

  const alertedPaths = NETWORKS.flatMap((network) =>
    regionPairs(regions)
      .filter(([a, b]) =>
        directionsFor(a, b).some(({ dst, src }) =>
          byComponent.has(componentKey(src, dst, network)),
        ),
      )
      .map(([a, b]) => pathKey(a, b, network)),
  );

  // Auto-expand a path the first time it has an alert; the user can still
  // collapse it and toggle others freely afterwards.
  const alertedKey = alertedPaths.join(',');
  const [expanded, setExpanded] = React.useState<string[]>([]);
  const seenAlerted = React.useRef<Set<string>>(new Set());
  React.useEffect(() => {
    const current = alertedKey ? alertedKey.split(',') : [];
    const newly = current.filter((key) => !seenAlerted.current.has(key));
    if (newly.length > 0)
      setExpanded((prev) => [...new Set([...prev, ...newly])]);
    seenAlerted.current = new Set(current);
  }, [alertedKey]);

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
        {NETWORKS.map((network) => {
          const pairs = regionPairs(regions).filter(([a, b]) =>
            directionsFor(a, b).some(({ dst, src }) =>
              byComponent.has(componentKey(src, dst, network)),
            ),
          );
          if (pairs.length === 0) return null;

          return (
            <Stack key={network} gap={2}>
              <Heading size="sm" textTransform="uppercase" color="fg.muted">
                {network}
              </Heading>

              <Accordion.Root
                multiple
                lazyMount
                unmountOnExit
                value={expanded}
                onValueChange={(details) => setExpanded(details.value)}
              >
                {pairs.map(([a, b]) => {
                  const key = pathKey(a, b, network);
                  const directions = directionsFor(a, b);

                  return (
                    <Accordion.Item key={key} value={key}>
                      <Accordion.ItemTrigger>
                        <Text flex="1" fontSize="sm">
                          {a === b ? `${a} → ${b}` : `${a} ↔ ${b}`}
                        </Text>
                        <HStack gap={3} paddingRight={3}>
                          {directions.map((direction) => {
                            const severity = worstSeverity(
                              byComponent.get(
                                componentKey(
                                  direction.src,
                                  direction.dst,
                                  network,
                                ),
                              ) ?? [],
                            );
                            return (
                              <HStack key={direction.label} gap={1}>
                                {direction.label && (
                                  <Text fontSize="xs" color="fg.subtle">
                                    {direction.label}
                                  </Text>
                                )}
                                {severity ? (
                                  <Badge
                                    colorPalette={SEVERITY_PALETTE[severity]}
                                  >
                                    {severity}
                                  </Badge>
                                ) : (
                                  <Text fontSize="sm" color="fg.subtle">
                                    ✓
                                  </Text>
                                )}
                              </HStack>
                            );
                          })}
                        </HStack>
                        <Accordion.ItemIndicator />
                      </Accordion.ItemTrigger>

                      <Accordion.ItemContent>
                        <Accordion.ItemBody>
                          <Stack gap={5}>
                            {directions.map((direction) => {
                              const componentAlerts =
                                byComponent.get(
                                  componentKey(
                                    direction.src,
                                    direction.dst,
                                    network,
                                  ),
                                ) ?? [];
                              const severity = worstSeverity(componentAlerts);
                              return (
                                <Box
                                  key={direction.label}
                                  borderWidth="1px"
                                  borderColor={
                                    severity
                                      ? `${SEVERITY_PALETTE[severity]}.solid`
                                      : 'border'
                                  }
                                  borderRadius="md"
                                  bg="bg.subtle"
                                  padding={3}
                                >
                                  <HStack
                                    justify="space-between"
                                    marginBottom={2}
                                  >
                                    <Text
                                      fontSize="xs"
                                      textTransform="uppercase"
                                      letterSpacing="wide"
                                      color="fg.muted"
                                    >
                                      {direction.src} → {direction.dst}
                                    </Text>
                                    {severity && (
                                      <Badge
                                        colorPalette={
                                          SEVERITY_PALETTE[severity]
                                        }
                                      >
                                        {severity}
                                      </Badge>
                                    )}
                                  </HStack>
                                  {componentAlerts.length > 0 ? (
                                    <AlertDetails alerts={componentAlerts} />
                                  ) : (
                                    <Text fontSize="sm" color="fg.subtle">
                                      all good
                                    </Text>
                                  )}
                                </Box>
                              );
                            })}
                          </Stack>
                        </Accordion.ItemBody>
                      </Accordion.ItemContent>
                    </Accordion.Item>
                  );
                })}
              </Accordion.Root>
            </Stack>
          );
        })}
      </Stack>
    </Box>
  );
}
