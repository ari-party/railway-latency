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
import { useProbes, useUpdateAllProbes } from '@/lib/queries';

import type { ConvergeRunState } from '@/lib/converge';

interface ProbeProgressDialogProps {
  latestSha: string | null;
  onClose: () => void;
}

interface Run {
  probeIds: string[];
  baseline: Record<string, string | null>;
}

export function ProbeProgressDialog({
  latestSha,
  onClose,
}: ProbeProgressDialogProps) {
  const [run, setRun] = useState<Run | null>(null);
  const probes = useProbes({ fastPoll: run !== null });
  const updateAll = useUpdateAllProbes();

  const probesById = useMemo(
    () => new Map((probes.data ?? []).map((probe) => [probe.probeId, probe])),
    [probes.data],
  );

  function start() {
    if (!latestSha) return;
    updateAll.mutate(latestSha, {
      onSuccess: (result) => {
        if (result.probeIds.length === 0) {
          onClose();
          return;
        }

        const baseline: Record<string, string | null> = {};
        for (const probeId of result.probeIds) {
          baseline[probeId] =
            probesById.get(probeId)?.converge.lastEventAt ?? null;
        }
        setRun({ probeIds: result.probeIds, baseline });
      },
    });
  }

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
      title="Update all to latest"
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
              onClick={start}
              disabled={!latestSha || updateAll.isPending}
            >
              {updateAll.isPending ? 'Starting…' : 'Start update'}
            </Button>
          </>
        )
      }
    >
      {!run ? (
        latestSha ? (
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
          </Stack>
        </Stack>
      )}
    </Dialog>
  );
}
