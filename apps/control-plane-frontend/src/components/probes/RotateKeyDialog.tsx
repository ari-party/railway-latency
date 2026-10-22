import { Alert, Button, Checkbox, Stack, Text } from '@chakra-ui/react';
import { useState } from 'react';

import { CodeBlock, Dialog } from '@/components/ui';
import { useRotateProbeKey } from '@/lib/queries';

interface RotateKeyDialogProps {
  probeId: string;
  onClose: () => void;
}

export function RotateKeyDialog({ onClose, probeId }: RotateKeyDialogProps) {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [revokePrevious, setRevokePrevious] = useState(false);
  const rotateKey = useRotateProbeKey(probeId);

  function handleRotate() {
    rotateKey.mutate(
      { revokePrevious },
      {
        onSuccess: (result) => setApiKey(result.apiKey),
      },
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Rotate API key"
      description={
        <Text as="span" fontFamily="mono">
          {probeId}
        </Text>
      }
      footer={
        apiKey ? (
          <Button size="sm" onClick={onClose}>
            Done
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
              onClick={handleRotate}
              disabled={rotateKey.isPending}
            >
              {rotateKey.isPending ? 'Rotating…' : 'Rotate key'}
            </Button>
          </>
        )
      }
    >
      {apiKey ? (
        <Stack gap="3">
          <Alert.Root status="warning" size="sm">
            <Alert.Indicator />
            <Alert.Description>
              This key is shown{' '}
              <Text as="span" fontWeight="medium">
                once
              </Text>
              . Copy it now. It cannot be retrieved again.
            </Alert.Description>
          </Alert.Root>
          <CodeBlock label="API key" code={apiKey} />
        </Stack>
      ) : (
        <Stack gap="3">
          <Text textStyle="sm" color="fg.muted">
            Minting a new key supersedes the current one (the previous key is
            honored for a short overlap). The plaintext is shown only once.
          </Text>
          <Checkbox.Root
            checked={revokePrevious}
            onCheckedChange={(event) =>
              setRevokePrevious(event.checked === true)
            }
            colorPalette="red"
            size="sm"
          >
            <Checkbox.HiddenInput />
            <Checkbox.Control />
            <Checkbox.Label textStyle="sm">
              Leaked: revoke the current key immediately
            </Checkbox.Label>
          </Checkbox.Root>
        </Stack>
      )}
    </Dialog>
  );
}
