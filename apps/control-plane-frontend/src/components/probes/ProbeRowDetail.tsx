import {
  Badge,
  Box,
  Button,
  DataList,
  HStack,
  SimpleGrid,
  Stack,
  Text,
} from '@chakra-ui/react';
import { useEffect, useState } from 'react';

import { ProbeForm } from '@/components/probes/ProbeForm';
import { StatusBadge, Tooltip } from '@/components/ui';
import { hasDrift, relativeTime, shortSha } from '@/lib/format';
import { toPatchProbeInput, validateProbeForm } from '@/lib/probeForm';
import { usePatchProbe, useProbeEvents } from '@/lib/queries';
import { deriveDisplayStatus } from '@/lib/status';

import type { ProbeFormValues } from '@/lib/probeForm';
import type { Probe, ProbeEvent } from '@railway-latency/types';

interface ProbeRowDetailProps {
  probe: Probe;
  latestSha: string | null;
}

const CONVERGE_KINDS = new Set([
  'ansible_ok',
  'ansible_failed',
  'converge_failed',
]);

function valuesFromProbe(probe: Probe): ProbeFormValues {
  return {
    probeId: probe.probeId,
    lat: String(probe.lat),
    lon: String(probe.lon),
    host: probe.host ?? '',
  };
}

function eventLog(event: ProbeEvent): string | null {
  if (typeof event.detail.tail === 'string') return event.detail.tail;
  if (typeof event.detail.reason === 'string') return event.detail.reason;
  return null;
}

function RecentRuns({ probe }: { probe: Probe }) {
  const events = useProbeEvents(probe.probeId, {
    enabled: true,
    pollWhileRunning: probe.converge.running,
  });
  const [openLog, setOpenLog] = useState<number | null>(null);

  const { refetch } = events;

  useEffect(() => {
    if (!probe.converge.running) void refetch();
  }, [probe.converge.running, probe.converge.lastEventAt, refetch]);

  const runs = (events.data ?? [])
    .filter((event) => CONVERGE_KINDS.has(event.kind))
    .slice(0, 6);

  return (
    <Stack gap="1.5">
      <Text textStyle="xs" color="fg.subtle" textTransform="uppercase">
        Recent runs
      </Text>
      {events.isLoading ? (
        <Text textStyle="xs" color="fg.muted">
          Loading…
        </Text>
      ) : runs.length === 0 ? (
        <Text textStyle="xs" color="fg.muted">
          No converge runs yet.
        </Text>
      ) : (
        runs.map((event) => {
          const ok = event.kind === 'ansible_ok';
          const log = eventLog(event);
          return (
            <Box key={event.id}>
              <HStack gap="2">
                <Text color={ok ? 'green.fg' : 'red.fg'} textStyle="xs">
                  {ok ? '✓' : '✗'}
                </Text>
                <Text textStyle="xs" color="fg.muted">
                  {ok ? 'ok' : 'failed'} · {relativeTime(event.createdAt)}
                </Text>
                {!ok && log && (
                  <Button
                    size="xs"
                    variant="ghost"
                    colorPalette="gray"
                    onClick={() =>
                      setOpenLog(openLog === event.id ? null : event.id)
                    }
                  >
                    {openLog === event.id ? 'hide log' : 'log'}
                  </Button>
                )}
              </HStack>
              {openLog === event.id && log && (
                <Box
                  as="pre"
                  fontFamily="mono"
                  fontSize="xs"
                  whiteSpace="pre-wrap"
                  bg="bg.muted"
                  p="2"
                  mt="1"
                  borderRadius="sm"
                  maxH="200px"
                  overflowY="auto"
                >
                  {log}
                </Box>
              )}
            </Box>
          );
        })
      )}
    </Stack>
  );
}

export function ProbeRowDetail({ latestSha, probe }: ProbeRowDetailProps) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<ProbeFormValues>(() =>
    valuesFromProbe(probe),
  );
  const [showErrors, setShowErrors] = useState(false);
  const patchProbe = usePatchProbe(probe.probeId);

  const errors = validateProbeForm(values, { includeProbeId: false });
  const display = deriveDisplayStatus(probe.status, probe.lastSeen);
  const drifted = hasDrift(probe.deployedSha, latestSha);

  function handleSave() {
    setShowErrors(true);
    if (Object.keys(errors).length > 0) return;
    patchProbe.mutate(toPatchProbeInput(values), {
      onSuccess: () => setEditing(false),
    });
  }

  function cancelEdit() {
    setValues(valuesFromProbe(probe));
    setShowErrors(false);
    setEditing(false);
  }

  return (
    <Box p="4">
      <SimpleGrid columns={{ base: 1, md: 2 }} gap="6">
        <Stack gap="3">
          {editing ? (
            <>
              <ProbeForm
                values={values}
                errors={showErrors ? errors : {}}
                onChange={setValues}
                includeProbeId={false}
                disabled={patchProbe.isPending}
              />
              <HStack>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={patchProbe.isPending}
                >
                  {patchProbe.isPending ? 'Saving…' : 'Save changes'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  colorPalette="gray"
                  onClick={cancelEdit}
                >
                  Cancel
                </Button>
              </HStack>
            </>
          ) : (
            <>
              <DataList.Root orientation="horizontal" size="sm">
                <DataList.Item>
                  <DataList.ItemLabel>Status</DataList.ItemLabel>
                  <DataList.ItemValue>
                    <StatusBadge status={display} />
                  </DataList.ItemValue>
                </DataList.Item>

                <DataList.Item>
                  <DataList.ItemLabel>Coordinates</DataList.ItemLabel>
                  <DataList.ItemValue fontFamily="mono">
                    {probe.lat}, {probe.lon}
                  </DataList.ItemValue>
                </DataList.Item>

                <DataList.Item>
                  <DataList.ItemLabel>Deployed SHA</DataList.ItemLabel>
                  {probe.deployedSha ? (
                    <DataList.ItemValue fontFamily="mono">
                      <HStack gap="1.5">
                        {shortSha(probe.deployedSha)}
                        {drifted && (
                          <Tooltip
                            content={`Drifted from latest (${shortSha(latestSha)})`}
                          >
                            <Badge variant="subtle" colorPalette="orange">
                              drift
                            </Badge>
                          </Tooltip>
                        )}
                      </HStack>
                    </DataList.ItemValue>
                  ) : (
                    <DataList.ItemValue color="fg.subtle">
                      not deployed
                    </DataList.ItemValue>
                  )}
                </DataList.Item>

                <DataList.Item>
                  <DataList.ItemLabel>Host</DataList.ItemLabel>
                  <DataList.ItemValue fontFamily="mono">
                    {probe.host ?? '-'}
                  </DataList.ItemValue>
                </DataList.Item>

                <DataList.Item>
                  <DataList.ItemLabel>Last seen</DataList.ItemLabel>
                  <DataList.ItemValue fontFamily="mono">
                    {relativeTime(probe.lastSeen)}
                  </DataList.ItemValue>
                </DataList.Item>
              </DataList.Root>

              <Button
                size="sm"
                variant="outline"
                colorPalette="gray"
                alignSelf="start"
                onClick={() => {
                  setValues(valuesFromProbe(probe));
                  setEditing(true);
                }}
              >
                Edit
              </Button>
            </>
          )}
        </Stack>

        <RecentRuns probe={probe} />
      </SimpleGrid>
    </Box>
  );
}
