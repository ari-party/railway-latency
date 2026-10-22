import { Box, Button, Flex, HStack, Stack, Text } from '@chakra-ui/react';
import { useMemo, useState } from 'react';

import { Dialog } from '@/components/ui';
import {
  convergeRunState,
  RUN_STATE_COLOR,
  RUN_STATE_GLYPH,
  RUN_STATE_LABEL,
  summarizeRun,
} from '@/lib/converge';
import { shortSha } from '@/lib/format';
import {
  useProbes,
  useRotateAllProbeKeys,
  useUpdateAllProbes,
} from '@/lib/queries';

import type { ConvergeRunState } from '@/lib/converge';
import type { RotateAllResult } from '@railway-latency/types';

export type FleetRunMode = 'update' | 'rotate-keys';

const SKIP_REASON_LABEL: Record<
  RotateAllResult['skipped'][number]['reason'],
  string
> = {
  not_deployed: 'not deployed',
  converge_running: 'converge already running',
};

interface ProbeProgressDialogProps {
  mode: FleetRunMode;
  latestSha: string | null;
  onClose: () => void;
}

interface Run {
  probeIds: string[];
  baseline: Record<string, string | null>;
  skipped: RotateAllResult['skipped'];
}

export function ProbeProgressDialog({
  latestSha,
  mode,
  onClose,
}: ProbeProgressDialogProps) {
  const [run, setRun] = useState<Run | null>(null);
  const probes = useProbes({ fastPoll: run !== null });
  const updateAll = useUpdateAllProbes();
  const rotateAll = useRotateAllProbeKeys();
  const pending = updateAll.isPending || rotateAll.isPending;

  const probesById = useMemo(
    () => new Map((probes.data ?? []).map((probe) => [probe.probeId, probe])),
    [probes.data],
  );

  function track(probeIds: string[], skipped: RotateAllResult['skipped'] = []) {
    if (probeIds.length === 0 && skipped.length === 0) {
      onClose();
      return;
    }

    const baseline: Record<string, string | null> = {};
    for (const probeId of probeIds) {
      baseline[probeId] = probesById.get(probeId)?.converge.lastEventAt ?? null;
    }
    setRun({ probeIds, baseline, skipped });
  }

  function start() {
    if (mode === 'rotate-keys') {
      rotateAll.mutate(undefined, {
        onSuccess: (result) => track(result.probeIds, result.skipped),
      });
      return;
    }
    if (!latestSha) return;
    updateAll.mutate(latestSha, {
      onSuccess: (result) => track(result.probeIds),
    });
  }

  const canStart = mode === 'rotate-keys' || latestSha !== null;

  const rows = run
    ? run.probeIds.flatMap((probeId) => {
        const probe = probesById.get(probeId);
        if (!probe) return [];

        const state: ConvergeRunState = convergeRunState(
          probe.converge,
          run.baseline[probeId] ?? null,
        );

        return [{ probeId, state }];
      })
    : [];

  const progress = summarizeRun(rows.map((row) => row.state));
  const percent =
    progress.total === 0
      ? 0
      : Math.round((progress.done / progress.total) * 100);

  return (
    <Dialog
      open
      onClose={onClose}
      title={
        mode === 'rotate-keys' ? 'Rotate fleet keys' : 'Update all to latest'
      }
      footer={
        run ? (
          <Button
            size="sm"
            variant="ghost"
            colorPalette="gray"
            onClick={onClose}
          >
            Close (runs in background)
          </Button>
        ) : (
          <>
            <Button
              size="sm"
              variant="ghost"
              colorPalette="gray"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              colorPalette={mode === 'rotate-keys' ? 'red' : undefined}
              onClick={start}
              disabled={!canStart || pending}
            >
              {pending
                ? 'Starting…'
                : mode === 'rotate-keys'
                  ? 'Rotate fleet keys'
                  : 'Start update'}
            </Button>
          </>
        )
      }
    >
      {!run ? (
        mode === 'rotate-keys' ? (
          <Text textStyle="sm" color="fg.muted">
            Issues new API keys and pushes the current SSH key to every deployed
            probe. Old API keys stop working immediately.
          </Text>
        ) : latestSha ? (
          <Text textStyle="sm" color="fg.muted">
            Every enrolled and active probe will converge to{' '}
            <Text as="span" fontFamily="mono" color="fg">
              {shortSha(latestSha)}
            </Text>
            . You can close this dialog once it starts; the run continues in the
            background.
          </Text>
        ) : (
          <Text textStyle="sm" color="fg.muted">
            The latest release SHA is unavailable, so a fleet update cannot be
            started right now.
          </Text>
        )
      ) : (
        <Stack gap="3">
          <Text textStyle="sm" color="fg.muted">
            {progress.done} / {progress.total} done
            {progress.failed > 0 ? ` · ${progress.failed} failed` : ''}
          </Text>
          <Box bg="bg.muted" borderRadius="full" h="1.5">
            <Box
              bg={progress.failed > 0 ? 'red.solid' : 'green.solid'}
              h="full"
              borderRadius="full"
              width={`${percent}%`}
              transition="width 0.3s"
            />
          </Box>
          <Stack gap="1" maxH="320px" overflowY="auto">
            {rows.map((row) => (
              <Flex key={row.probeId} justify="space-between" align="center">
                <Text fontFamily="mono" textStyle="xs">
                  {row.probeId}
                </Text>
                <HStack gap="1.5">
                  <Text color={RUN_STATE_COLOR[row.state]} textStyle="xs">
                    {RUN_STATE_GLYPH[row.state]}
                  </Text>
                  <Text color="fg.muted" textStyle="xs">
                    {RUN_STATE_LABEL[row.state]}
                  </Text>
                </HStack>
              </Flex>
            ))}
            {run.skipped.map((skip) => (
              <Flex key={skip.probeId} justify="space-between" align="center">
                <Text fontFamily="mono" textStyle="xs">
                  {skip.probeId}
                </Text>
                <Text color="fg.muted" textStyle="xs">
                  skipped · {SKIP_REASON_LABEL[skip.reason]}
                </Text>
              </Flex>
            ))}
          </Stack>
        </Stack>
      )}
    </Dialog>
  );
}
