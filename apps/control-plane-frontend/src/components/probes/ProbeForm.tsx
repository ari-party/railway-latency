import { Field, Input, SimpleGrid, Stack } from '@chakra-ui/react';

import type { ProbeFormErrors, ProbeFormValues } from '@/lib/probeForm';

interface ProbeFormProps {
  values: ProbeFormValues;
  errors: ProbeFormErrors;
  onChange: (values: ProbeFormValues) => void;
  includeProbeId: boolean;
  disabled?: boolean;
}

export function ProbeForm({
  disabled,
  errors,
  includeProbeId,
  onChange,
  values,
}: ProbeFormProps) {
  function set<TKey extends keyof ProbeFormValues>(
    key: TKey,
    value: ProbeFormValues[TKey],
  ) {
    onChange({ ...values, [key]: value });
  }

  return (
    <Stack gap="4">
      {includeProbeId && (
        <Field.Root
          required
          disabled={disabled}
          invalid={Boolean(errors.probeId)}
        >
          <Field.Label>
            Probe ID
            <Field.RequiredIndicator />
          </Field.Label>
          <Input
            size="sm"
            fontFamily="mono"
            value={values.probeId}
            placeholder="asia-hcloud-sin1"
            onChange={(event) => set('probeId', event.target.value)}
          />
          {errors.probeId ? (
            <Field.ErrorText>{errors.probeId}</Field.ErrorText>
          ) : (
            <Field.HelperText>
              Region-style identifier, e.g. asia-hcloud-sin1. Immutable once
              created.
            </Field.HelperText>
          )}
        </Field.Root>
      )}

      <SimpleGrid columns={2} gap="3">
        <Field.Root required disabled={disabled} invalid={Boolean(errors.lat)}>
          <Field.Label>
            Latitude
            <Field.RequiredIndicator />
          </Field.Label>
          <Input
            size="sm"
            fontFamily="mono"
            inputMode="decimal"
            value={values.lat}
            placeholder="1.3521"
            onChange={(event) => set('lat', event.target.value)}
          />
          {errors.lat && <Field.ErrorText>{errors.lat}</Field.ErrorText>}
        </Field.Root>

        <Field.Root required disabled={disabled} invalid={Boolean(errors.lon)}>
          <Field.Label>
            Longitude
            <Field.RequiredIndicator />
          </Field.Label>
          <Input
            size="sm"
            fontFamily="mono"
            inputMode="decimal"
            value={values.lon}
            placeholder="103.8198"
            onChange={(event) => set('lon', event.target.value)}
          />
          {errors.lon && <Field.ErrorText>{errors.lon}</Field.ErrorText>}
        </Field.Root>
      </SimpleGrid>

      <Field.Root disabled={disabled} invalid={Boolean(errors.host)}>
        <Field.Label>Host (optional)</Field.Label>
        <Input
          size="sm"
          fontFamily="mono"
          value={values.host}
          placeholder="Auto-detected when the probe calls home"
          onChange={(event) => set('host', event.target.value)}
        />
        {errors.host ? (
          <Field.ErrorText>{errors.host}</Field.ErrorText>
        ) : (
          <Field.HelperText>
            Leave blank to use the address the probe enrolls from.
          </Field.HelperText>
        )}
      </Field.Root>
    </Stack>
  );
}
