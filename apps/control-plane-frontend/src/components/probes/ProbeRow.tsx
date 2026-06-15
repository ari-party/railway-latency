import { Badge, HStack, Spinner, Table, Text } from '@chakra-ui/react';
import { Ban, GitBranch, KeyRound, ShieldOff, Trash2 } from 'lucide-react';

import { ActionsMenu } from '@/components/probes/ActionsMenu';
import { ProbeRowDetail } from '@/components/probes/ProbeRowDetail';
import { StatusBadge, Tooltip } from '@/components/ui';
import { hasDrift, relativeTime, shortSha } from '@/lib/format';
import { deriveDisplayStatus } from '@/lib/status';

import type { MenuAction } from '@/components/probes/ActionsMenu';
import type { ProbeAction } from '@/components/probes/ProbeActionDialogs';
import type { Probe } from '@railway-latency/types';
import type { KeyboardEvent } from 'react';

interface ProbeRowProps {
  probe: Probe;
  latestSha: string | null;
  expanded: boolean;
  onToggle: (probeId: string) => void;
  onAction: (probe: Probe, action: ProbeAction) => void;
}

const COLUMN_COUNT = 6;

function probeHasKey(status: Probe['status']): boolean {
  return status !== 'created' && status !== 'revoked';
}

export function ProbeRow({
  expanded,
  latestSha,
  onAction,
  onToggle,
  probe,
}: ProbeRowProps) {
  const display = deriveDisplayStatus(probe.status, probe.lastSeen);
  const drifted = hasDrift(probe.deployedSha, latestSha);
  const hasKey = probeHasKey(probe.status);
  const { converge } = probe;

  const actions: MenuAction[] = [
    {
      label: 'Rotate key',
      icon: KeyRound,
      disabled: !hasKey,
      onSelect: () => onAction(probe, 'rotate'),
    },
    {
      label: 'Update…',
      icon: GitBranch,
      onSelect: () => onAction(probe, 'update'),
    },
    {
      label: 'Revoke key',
      icon: ShieldOff,
      disabled: !hasKey,
      onSelect: () => onAction(probe, 'revoke'),
    },
    {
      label: 'Disable',
      icon: Ban,
      disabled: probe.status === 'disabled',
      onSelect: () => onAction(probe, 'disable'),
    },
    {
      label: 'Teardown & delete',
      icon: Trash2,
      destructive: true,
      onSelect: () => onAction(probe, 'delete'),
    },
  ];

  function handleRowKeyDown(event: KeyboardEvent<HTMLTableRowElement>) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onToggle(probe.probeId);
    }
  }

  return (
    <>
      <Table.Row
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={`Toggle ${probe.probeId} details`}
        onClick={() => onToggle(probe.probeId)}
        onKeyDown={handleRowKeyDown}
        cursor="pointer"
      >
        <Table.Cell fontFamily="mono">{probe.probeId}</Table.Cell>

        <Table.Cell>
          {converge.running ? (
            <HStack gap="1.5" color="fg.muted">
              <Spinner size="xs" />
              <Text textStyle="xs">updating…</Text>
            </HStack>
          ) : (
            <HStack gap="1.5">
              <StatusBadge status={display} />
              {converge.lastResult === 'failed' && (
                <Tooltip content="Last converge failed; expand for the log">
                  <Badge variant="subtle" colorPalette="red">
                    update failed
                  </Badge>
                </Tooltip>
              )}
            </HStack>
          )}
        </Table.Cell>

        <Table.Cell fontFamily="mono">
          {probe.deployedSha ? (
            <HStack display="inline-flex" gap="1.5">
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
          ) : (
            <Text as="span" fontFamily="body" color="fg.subtle">
              not deployed
            </Text>
          )}
        </Table.Cell>

        <Table.Cell fontFamily="mono">{probe.host ?? '-'}</Table.Cell>

        <Table.Cell fontFamily="mono" color="fg.muted">
          {relativeTime(probe.lastSeen)}
        </Table.Cell>

        <Table.Cell
          textAlign="end"
          onClick={(event) => event.stopPropagation()}
        >
          <ActionsMenu
            actions={actions}
            label={`Actions for ${probe.probeId}`}
          />
        </Table.Cell>
      </Table.Row>

      {expanded && (
        <Table.Row>
          <Table.Cell colSpan={COLUMN_COUNT} bg="bg.subtle" p="0">
            <ProbeRowDetail probe={probe} latestSha={latestSha} />
          </Table.Cell>
        </Table.Row>
      )}
    </>
  );
}
