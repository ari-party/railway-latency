import { Text } from '@chakra-ui/react';

import { ConfirmDialog } from '@/components/ui';
import { shortSha } from '@/lib/format';
import { useUpdateAllProbes } from '@/lib/queries';

interface UpdateAllDialogProps {
  latestSha: string | null;
  onClose: () => void;
}

export function UpdateAllDialog({ latestSha, onClose }: UpdateAllDialogProps) {
  const updateAll = useUpdateAllProbes();

  function handleConfirm() {
    if (!latestSha) return;
    updateAll.mutate(latestSha, { onSuccess: onClose });
  }

  return (
    <ConfirmDialog
      open
      onClose={onClose}
      onConfirm={handleConfirm}
      title="Update all probes to latest"
      confirmLabel="Update all"
      confirmColorPalette="purple"
      pending={updateAll.isPending || !latestSha}
    >
      {latestSha ? (
        <Text textStyle="sm" color="fg.muted">
          Every enrolled and active probe will converge to{' '}
          <Text as="span" fontFamily="mono" color="fg">
            {shortSha(latestSha)}
          </Text>
          . Updates run in the background.
        </Text>
      ) : (
        <Text textStyle="sm" color="fg.muted">
          The latest release SHA is unavailable, so a fleet update cannot be
          started right now.
        </Text>
      )}
    </ConfirmDialog>
  );
}
