import { Button, Stack, Text } from '@chakra-ui/react';
import { useState } from 'react';

import { ProbeForm } from '@/components/probes/ProbeForm';
import { CodeBlock, Drawer } from '@/components/ui';
import {
  EMPTY_PROBE_FORM,
  toCreateProbeInput,
  validateProbeForm,
} from '@/lib/probeForm';
import { useCreateProbe } from '@/lib/queries';

import type { ProbeFormValues } from '@/lib/probeForm';
import type { ProbeEnrollment } from '@railway-latency/types';

interface CreateProbeDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function CreateProbeDrawer({ onClose, open }: CreateProbeDrawerProps) {
  const [values, setValues] = useState<ProbeFormValues>(EMPTY_PROBE_FORM);
  const [showErrors, setShowErrors] = useState(false);
  const [enrollment, setEnrollment] = useState<ProbeEnrollment | null>(null);
  const createProbe = useCreateProbe();

  const errors = validateProbeForm(values, { includeProbeId: true });

  function reset() {
    setValues(EMPTY_PROBE_FORM);
    setShowErrors(false);
    setEnrollment(null);
    createProbe.reset();
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleSubmit() {
    setShowErrors(true);
    if (Object.keys(errors).length > 0) return;
    createProbe.mutate(toCreateProbeInput(values), {
      onSuccess: (result) => setEnrollment(result),
    });
  }

  return (
    <Drawer
      open={open}
      onClose={handleClose}
      title={enrollment ? 'Probe enrolled' : 'New probe'}
      footer={
        enrollment ? (
          <Button size="sm" onClick={handleClose}>
            Done
          </Button>
        ) : (
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
              disabled={createProbe.isPending}
            >
              {createProbe.isPending ? 'Creating…' : 'Create probe'}
            </Button>
          </>
        )
      }
    >
      {enrollment ? (
        <Stack gap="3">
          <CodeBlock label="Install command" code={enrollment.installCommand} />
          <Text textStyle="xs" color="fg.muted">
            The enroll token is{' '}
            <Text as="span" fontWeight="medium" color="fg">
              single-use
            </Text>{' '}
            and expires shortly. The probe&apos;s API key is delivered later by
            Ansible, not shown here.
          </Text>
        </Stack>
      ) : (
        <ProbeForm
          values={values}
          errors={showErrors ? errors : {}}
          onChange={setValues}
          includeProbeId
          disabled={createProbe.isPending}
        />
      )}
    </Drawer>
  );
}
