import type { CreateProbeInput, PatchProbeInput } from '@railway-latency/types';

const PROBE_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const HOST_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9.-]*$/;

export interface ProbeFormValues {
  probeId: string;
  lat: string;
  lon: string;
  host: string;
}

export const EMPTY_PROBE_FORM: ProbeFormValues = {
  probeId: '',
  lat: '',
  lon: '',
  host: '',
};

export type ProbeFormErrors = Partial<Record<keyof ProbeFormValues, string>>;

function parseCoordinate(raw: string, min: number, max: number): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

export function validateProbeForm(
  values: ProbeFormValues,
  options: { includeProbeId: boolean },
): ProbeFormErrors {
  const errors: ProbeFormErrors = {};

  if (options.includeProbeId) {
    const probeId = values.probeId.trim();
    if (probeId === '') {
      errors.probeId = 'Required.';
    } else if (!PROBE_ID_PATTERN.test(probeId)) {
      errors.probeId =
        'Lowercase letters, digits and hyphens; must start alphanumeric.';
    }
  }

  if (parseCoordinate(values.lat, -90, 90) === null) {
    errors.lat = 'Latitude between -90 and 90.';
  }
  if (parseCoordinate(values.lon, -180, 180) === null) {
    errors.lon = 'Longitude between -180 and 180.';
  }

  const host = values.host.trim();
  if (host !== '' && !HOST_PATTERN.test(host)) {
    errors.host = 'Letters, digits, dots and hyphens; must start alphanumeric.';
  }

  return errors;
}

export function toCreateProbeInput(values: ProbeFormValues): CreateProbeInput {
  const host = values.host.trim();
  return {
    probeId: values.probeId.trim(),
    lat: Number(values.lat.trim()),
    lon: Number(values.lon.trim()),
    ...(host !== '' ? { host } : {}),
  };
}

export function toPatchProbeInput(values: ProbeFormValues): PatchProbeInput {
  return {
    lat: Number(values.lat.trim()),
    lon: Number(values.lon.trim()),
    host: values.host.trim(),
  };
}
