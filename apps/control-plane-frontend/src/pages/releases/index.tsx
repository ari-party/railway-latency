import {
  Badge,
  Button,
  Card,
  Clipboard,
  HStack,
  Stack,
  Stat,
  Table,
  Text,
} from '@chakra-ui/react';
import { Check, Copy, Package } from 'lucide-react';
import { useMemo, useState } from 'react';

import { UpdateAllDialog } from '@/components/probes/UpdateAllDialog';
import { EmptyState } from '@/components/ui';
import { summarizeDrift } from '@/lib/drift';
import { shortSha } from '@/lib/format';
import { useLatestRelease, useProbes } from '@/lib/queries';

function DriftStat({ label, value }: { label: string; value: number }) {
  return (
    <Stat.Root>
      <Stat.ValueText fontFamily="mono">{value}</Stat.ValueText>
      <Stat.Label>{label}</Stat.Label>
    </Stat.Root>
  );
}

export default function ReleasesPage() {
  const latestRelease = useLatestRelease();
  const probes = useProbes();
  const latestSha = latestRelease.data?.sha ?? null;

  const [updatingAll, setUpdatingAll] = useState(false);

  const summary = useMemo(
    () => summarizeDrift(probes.data ?? [], latestSha),
    [probes.data, latestSha],
  );

  return (
    <Stack gap="4" p="5">
      <Card.Root size="sm">
        <Card.Header>
          <HStack align="flex-start" justify="space-between" gap="4">
            <Stack gap="1">
              <Card.Title>Latest release</Card.Title>
              <Card.Description>
                The newest probe build SHA reported by the control-plane.
              </Card.Description>
            </Stack>
            <Button
              size="sm"
              onClick={() => setUpdatingAll(true)}
              disabled={!latestSha}
            >
              Update all to latest
            </Button>
          </HStack>
        </Card.Header>
        <Card.Body>
          <HStack justify="space-between" gap="4">
            {latestSha ? (
              <>
                <Text fontFamily="mono">{latestSha}</Text>
                <Clipboard.Root value={latestSha}>
                  <Clipboard.Trigger asChild>
                    <Button size="xs" variant="ghost" colorPalette="gray">
                      <Clipboard.Indicator copied={<Check />}>
                        <Copy />
                      </Clipboard.Indicator>
                      Copy SHA
                    </Button>
                  </Clipboard.Trigger>
                </Clipboard.Root>
              </>
            ) : (
              <Text textStyle="sm" color="fg.muted">
                Unavailable. The releases source could not be reached.
              </Text>
            )}
          </HStack>
        </Card.Body>
      </Card.Root>

      {probes.isError ? (
        <EmptyState
          icon={<Package />}
          title="Couldn't load fleet drift"
          description="The probes request failed. Check that the API is reachable and retry."
        >
          <Button
            size="sm"
            variant="outline"
            colorPalette="gray"
            onClick={() => probes.refetch()}
          >
            Retry
          </Button>
        </EmptyState>
      ) : (
        <Card.Root size="sm">
          <Card.Header>
            <Card.Title>Fleet drift</Card.Title>
            <Card.Description>
              How probes are distributed across deployed SHAs.
            </Card.Description>
          </Card.Header>
          <Card.Body>
            <Stack gap="4">
              <HStack gap="8" wrap="wrap">
                <DriftStat label="On latest" value={summary.onLatest} />
                <DriftStat label="Behind" value={summary.behind} />
                <DriftStat label="Not deployed" value={summary.notDeployed} />
              </HStack>

              {summary.groups.length > 0 && (
                <Table.Root size="sm">
                  <Table.Header>
                    <Table.Row>
                      <Table.ColumnHeader>Deployed SHA</Table.ColumnHeader>
                      <Table.ColumnHeader textAlign="end">
                        Probes
                      </Table.ColumnHeader>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {summary.groups.map((group) => (
                      <Table.Row key={group.sha ?? 'none'}>
                        <Table.Cell fontFamily="mono">
                          <HStack display="inline-flex" gap="1.5">
                            {group.sha ? (
                              shortSha(group.sha)
                            ) : (
                              <Text
                                as="span"
                                fontFamily="body"
                                color="fg.subtle"
                              >
                                not deployed
                              </Text>
                            )}
                            {group.isLatest && (
                              <Badge variant="subtle" colorPalette="purple">
                                latest
                              </Badge>
                            )}
                            {group.drifted && (
                              <Badge variant="subtle" colorPalette="orange">
                                drift
                              </Badge>
                            )}
                          </HStack>
                        </Table.Cell>
                        <Table.Cell textAlign="end" fontFamily="mono">
                          {group.count}
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Root>
              )}
            </Stack>
          </Card.Body>
        </Card.Root>
      )}

      {updatingAll && (
        <UpdateAllDialog
          latestSha={latestSha}
          onClose={() => setUpdatingAll(false)}
        />
      )}
    </Stack>
  );
}
