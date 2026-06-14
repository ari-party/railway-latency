import { Button, Field, Input, Text } from '@chakra-ui/react';
import { useState } from 'react';

import { Dialog } from '@/components/ui';
import { shortSha } from '@/lib/format';
import { useUpdateProbe } from '@/lib/queries';

const SHA_PATTERN = /^[0-9a-f]{7,40}$/;

interface UpdateProbeDialogProps {
  probeId: string;
  latestSha: string | null;
  onClose: () => void;
}

export function UpdateProbeDialog({
  latestSha,
  onClose,
  probeId,
}: UpdateProbeDialogProps) {
  const [sha, setSha] = useState(latestSha ?? '');
  const updateProbe = useUpdateProbe(probeId);

  const trimmed = sha.trim().toLowerCase();
  const valid = SHA_PATTERN.test(trimmed);
  const showShaError = trimmed !== '' && !valid;

  function handleUpdate() {
    if (!valid) return;
    updateProbe.mutate(trimmed, { onSuccess: onClose });
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Update probe"
      description={
        <Text as="span" fontFamily="mono">
          {probeId}
        </Text>
      }
      footer={
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
            onClick={handleUpdate}
            disabled={!valid || updateProbe.isPending}
          >
            {updateProbe.isPending ? 'Starting…' : 'Update'}
          </Button>
        </>
      }
    >
      <Field.Root invalid={showShaError}>
        <Field.Label>Target release SHA</Field.Label>
        <Input
          size="sm"
          fontFamily="mono"
          value={sha}
          placeholder="0a1b2c3"
          onChange={(event) => setSha(event.target.value)}
        />
        {showShaError ? (
          <Field.ErrorText>Expected a 7-40 char hex SHA.</Field.ErrorText>
        ) : (
          <Field.HelperText>
            {latestSha
              ? `Latest release is ${shortSha(latestSha)}.`
              : 'Latest release is unavailable; enter a SHA manually.'}
          </Field.HelperText>
        )}
      </Field.Root>
    </Dialog>
  );
}
