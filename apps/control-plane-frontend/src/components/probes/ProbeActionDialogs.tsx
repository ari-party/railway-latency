import { Checkbox, Stack, Text } from '@chakra-ui/react';
import { useState } from 'react';

import { RotateKeyDialog } from '@/components/probes/RotateKeyDialog';
import { UpdateProbeDialog } from '@/components/probes/UpdateProbeDialog';
import { ConfirmDialog } from '@/components/ui';
import {
  useDeleteProbe,
  useDisableProbe,
  useRevokeProbeKey,
} from '@/lib/queries';

import type { Probe } from '@railway-latency/types';

export type ProbeAction = 'rotate' | 'revoke' | 'disable' | 'update' | 'delete';

interface ProbeActionDialogsProps {
  probe: Probe;
  action: ProbeAction;
  latestSha: string | null;
  onClose: () => void;
}

function RevokeDialog({
  onClose,
  probe,
}: {
  probe: Probe;
  onClose: () => void;
}) {
  const revoke = useRevokeProbeKey(probe.probeId);
  return (
    <ConfirmDialog
      open
      onClose={onClose}
      onConfirm={() => revoke.mutate(undefined, { onSuccess: onClose })}
      title="Revoke API key"
      confirmLabel="Revoke key"
      pending={revoke.isPending}
    >
      <Text textStyle="sm" color="fg.muted">
        The ingestor will immediately reject{' '}
        <Text as="span" fontFamily="mono" color="fg">
          {probe.probeId}
        </Text>
        . Re-enroll or rotate to restore access.
      </Text>
    </ConfirmDialog>
  );
}

function DisableDialog({
  onClose,
  probe,
}: {
  probe: Probe;
  onClose: () => void;
}) {
  const disable = useDisableProbe(probe.probeId);
  return (
    <ConfirmDialog
      open
      onClose={onClose}
      onConfirm={() => disable.mutate(undefined, { onSuccess: onClose })}
      title="Disable probe"
      confirmLabel="Disable"
      confirmColorPalette="gray"
      pending={disable.isPending}
    >
      <Text textStyle="sm" color="fg.muted">
        <Text as="span" fontFamily="mono" color="fg">
          {probe.probeId}
        </Text>{' '}
        will be marked disabled and excluded from fleet updates. It keeps its
        key.
      </Text>
    </ConfirmDialog>
  );
}

function DeleteDialog({
  onClose,
  probe,
}: {
  probe: Probe;
  onClose: () => void;
}) {
  const deleteProbe = useDeleteProbe(probe.probeId);
  const [force, setForce] = useState(false);
  return (
    <ConfirmDialog
      open
      onClose={onClose}
      onConfirm={() => deleteProbe.mutate({ force }, { onSuccess: onClose })}
      title="Teardown & delete probe"
      confirmLabel="Teardown & delete"
      confirmationPhrase={probe.probeId}
      pending={deleteProbe.isPending}
    >
      <Stack gap="3">
        <Text textStyle="sm" color="fg.muted">
          This runs the teardown playbook (revokes the box&apos;s authorized
          keys and disables the unit), then removes the probe. If the host is
          unreachable the row is kept so you can retry.
        </Text>
        <Checkbox.Root
          checked={force}
          onCheckedChange={(event) => setForce(event.checked === true)}
          colorPalette="red"
          size="sm"
        >
          <Checkbox.HiddenInput />
          <Checkbox.Control />
          <Checkbox.Label textStyle="sm">
            Force-delete even if the host is unreachable (skips teardown).
          </Checkbox.Label>
        </Checkbox.Root>
      </Stack>
    </ConfirmDialog>
  );
}

export function ProbeActionDialogs({
  action,
  latestSha,
  onClose,
  probe,
}: ProbeActionDialogsProps) {
  switch (action) {
    case 'rotate':
      return <RotateKeyDialog probeId={probe.probeId} onClose={onClose} />;
    case 'update':
      return (
        <UpdateProbeDialog
          probeId={probe.probeId}
          latestSha={latestSha}
          onClose={onClose}
        />
      );
    case 'revoke':
      return <RevokeDialog probe={probe} onClose={onClose} />;
    case 'disable':
      return <DisableDialog probe={probe} onClose={onClose} />;
    case 'delete':
      return <DeleteDialog probe={probe} onClose={onClose} />;
    default:
      return null;
  }
}
