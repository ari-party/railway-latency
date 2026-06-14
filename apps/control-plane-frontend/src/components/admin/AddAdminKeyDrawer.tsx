import { Button, Field, Input, Stack, Textarea } from '@chakra-ui/react';
import { useState } from 'react';

import { Drawer } from '@/components/ui';
import { EMPTY_ADMIN_KEY_FORM, validateAdminKeyForm } from '@/lib/adminEntries';
import { useCreateAdminKey } from '@/lib/queries';

import type { AdminKeyFormValues } from '@/lib/adminEntries';

interface AddAdminKeyDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function AddAdminKeyDrawer({ onClose, open }: AddAdminKeyDrawerProps) {
  const [values, setValues] =
    useState<AdminKeyFormValues>(EMPTY_ADMIN_KEY_FORM);
  const [showErrors, setShowErrors] = useState(false);
  const createAdminKey = useCreateAdminKey();

  const errors = validateAdminKeyForm(values);
  const labelError = showErrors ? errors.label : undefined;
  const publicKeyError = showErrors ? errors.publicKey : undefined;

  function handleClose() {
    setValues(EMPTY_ADMIN_KEY_FORM);
    setShowErrors(false);
    onClose();
  }

  function handleSubmit() {
    setShowErrors(true);
    if (Object.keys(errors).length > 0) return;
    createAdminKey.mutate(
      { label: values.label.trim(), publicKey: values.publicKey.trim() },
      { onSuccess: handleClose },
    );
  }

  return (
    <Drawer
      open={open}
      onClose={handleClose}
      title="Add admin key"
      description="An SSH public key added to every probe's authorized_keys on the next converge."
      footer={
        <>
          <Button
            size="sm"
            variant="ghost"
            colorPalette="gray"
            onClick={handleClose}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={createAdminKey.isPending}
          >
            {createAdminKey.isPending ? 'Adding…' : 'Add key'}
          </Button>
        </>
      }
    >
      <Stack gap="4">
        <Field.Root
          required
          disabled={createAdminKey.isPending}
          invalid={Boolean(labelError)}
        >
          <Field.Label>
            Label
            <Field.RequiredIndicator />
          </Field.Label>
          <Input
            size="sm"
            value={values.label}
            placeholder="ops laptop"
            onChange={(event) =>
              setValues({ ...values, label: event.target.value })
            }
          />
          {labelError && <Field.ErrorText>{labelError}</Field.ErrorText>}
        </Field.Root>

        <Field.Root
          required
          disabled={createAdminKey.isPending}
          invalid={Boolean(publicKeyError)}
        >
          <Field.Label>
            Public key
            <Field.RequiredIndicator />
          </Field.Label>
          <Textarea
            size="sm"
            fontFamily="mono"
            rows={4}
            value={values.publicKey}
            placeholder="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5… ops@host"
            onChange={(event) =>
              setValues({ ...values, publicKey: event.target.value })
            }
          />
          {publicKeyError ? (
            <Field.ErrorText>{publicKeyError}</Field.ErrorText>
          ) : (
            <Field.HelperText>
              Paste the full line, e.g. ssh-ed25519 AAAA… user@host.
            </Field.HelperText>
          )}
        </Field.Root>
      </Stack>
    </Drawer>
  );
}
