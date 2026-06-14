import { Button, Input, Stack, Text } from '@chakra-ui/react';
import { useState } from 'react';

import { Dialog } from '@/components/ui/Dialog';

import type { ReactNode } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmColorPalette?: 'red' | 'purple' | 'gray';
  pending?: boolean;
  confirmationPhrase?: string;
  children?: ReactNode;
}

export function ConfirmDialog({
  cancelLabel = 'Cancel',
  children,
  confirmColorPalette = 'red',
  confirmLabel = 'Confirm',
  confirmationPhrase,
  description,
  onClose,
  onConfirm,
  open,
  pending,
  title,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('');

  function handleClose() {
    setTyped('');
    onClose();
  }

  function handleConfirm() {
    setTyped('');
    onConfirm();
  }

  const phraseSatisfied =
    !confirmationPhrase || typed.trim() === confirmationPhrase;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={title}
      description={description}
      footer={
        <>
          <Button
            size="sm"
            variant="ghost"
            colorPalette="gray"
            onClick={handleClose}
            disabled={pending}
          >
            {cancelLabel}
          </Button>
          <Button
            size="sm"
            colorPalette={confirmColorPalette}
            onClick={handleConfirm}
            disabled={pending || !phraseSatisfied}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}

      {confirmationPhrase && (
        <Stack gap="1.5" marginTop="3">
          <Text textStyle="xs" color="fg.muted">
            Type{' '}
            <Text as="span" fontFamily="mono" color="fg">
              {confirmationPhrase}
            </Text>{' '}
            to confirm.
          </Text>
          <Input
            size="sm"
            fontFamily="mono"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder={confirmationPhrase}
            aria-label="Confirmation phrase"
          />
        </Stack>
      )}
    </Dialog>
  );
}
