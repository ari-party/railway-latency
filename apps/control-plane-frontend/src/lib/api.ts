import { env } from '@/env';

import type { RequestOptions } from '@/lib/http';
import type {
  AdminKey,
  CreateAdminKeyInput,
  CreateProbeInput,
  LatestRelease,
  PatchedProbe,
  PatchProbeInput,
  Probe,
  ProbeEnrollment,
  ProbeEvent,
  RotatedKey,
  UpdateAllResult,
  UpdateProbeResult,
} from '@railway-latency/types';

export class ApiError extends Error {
  readonly status: number;

  readonly body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export interface ApiResponse<TResponse> {
  status: number;
  data: TResponse;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(path, `${env.CONTROL_PLANE_URL}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

async function request<TResponse>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResponse<TResponse>> {
  const { body, method = 'GET', query } = options;

  const headers: Record<string, string> = {
    'X-Internal-Token': env.CONTROL_PLANE_INTERNAL_TOKEN,
  };
  if (body !== undefined) headers['content-type'] = 'application/json';

  const response = await fetch(buildUrl(path, query), {
    method,
    cache: 'no-store',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 204) {
    return { status: 204, data: undefined as TResponse };
  }

  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    parsed = undefined;
  }

  if (!response.ok) {
    const message =
      (parsed as { message?: string } | undefined)?.message ??
      `control-plane request failed (${response.status})`;
    throw new ApiError(response.status, message, parsed);
  }

  return { status: response.status, data: parsed as TResponse };
}

export function listProbes(): Promise<ApiResponse<Probe[]>> {
  return request<Probe[]>('probes');
}

export function getProbe(probeId: string): Promise<ApiResponse<Probe>> {
  return request<Probe>(`probes/${encodeURIComponent(probeId)}`);
}

export function listProbeEvents(
  probeId: string,
  limit?: string,
): Promise<ApiResponse<ProbeEvent[]>> {
  return request<ProbeEvent[]>(`probes/${encodeURIComponent(probeId)}/events`, {
    query: { limit },
  });
}

export function createProbe(
  input: CreateProbeInput,
): Promise<ApiResponse<ProbeEnrollment>> {
  return request<ProbeEnrollment>('probes', { method: 'POST', body: input });
}

export function patchProbe(
  probeId: string,
  input: PatchProbeInput,
): Promise<ApiResponse<PatchedProbe>> {
  return request<PatchedProbe>(`probes/${encodeURIComponent(probeId)}`, {
    method: 'PATCH',
    body: input,
  });
}

export function getProbeInstall(
  probeId: string,
): Promise<ApiResponse<ProbeEnrollment>> {
  return request<ProbeEnrollment>(
    `probes/${encodeURIComponent(probeId)}/install`,
  );
}

export function rotateProbeKey(
  probeId: string,
): Promise<ApiResponse<RotatedKey>> {
  return request<RotatedKey>(
    `probes/${encodeURIComponent(probeId)}/key/rotate`,
    {
      method: 'POST',
    },
  );
}

export function revokeProbeKey(
  probeId: string,
): Promise<ApiResponse<{ status: string }>> {
  return request<{ status: string }>(
    `probes/${encodeURIComponent(probeId)}/key/revoke`,
    {
      method: 'POST',
    },
  );
}

export function disableProbe(
  probeId: string,
): Promise<ApiResponse<{ status: string }>> {
  return request<{ status: string }>(
    `probes/${encodeURIComponent(probeId)}/disable`,
    {
      method: 'POST',
    },
  );
}

export function updateProbe(
  probeId: string,
  sha: string,
): Promise<ApiResponse<UpdateProbeResult>> {
  return request<UpdateProbeResult>(
    `probes/${encodeURIComponent(probeId)}/update`,
    {
      method: 'POST',
      body: { sha },
    },
  );
}

export function updateAllProbes(
  sha: string,
): Promise<ApiResponse<UpdateAllResult>> {
  return request<UpdateAllResult>('probes/update-all', {
    method: 'POST',
    body: { sha },
  });
}

export function deleteProbe(
  probeId: string,
  options: { force?: boolean } = {},
): Promise<ApiResponse<void>> {
  return request<void>(`probes/${encodeURIComponent(probeId)}`, {
    method: 'DELETE',
    query: { force: options.force ? 'true' : undefined },
  });
}

export function listAdminKeys(): Promise<ApiResponse<AdminKey[]>> {
  return request<AdminKey[]>('admin-keys');
}

export function createAdminKey(
  input: CreateAdminKeyInput,
): Promise<ApiResponse<AdminKey>> {
  return request<AdminKey>('admin-keys', { method: 'POST', body: input });
}

export function deleteAdminKey(id: string): Promise<ApiResponse<void>> {
  return request<void>(`admin-keys/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export function getLatestRelease(): Promise<ApiResponse<LatestRelease>> {
  return request<LatestRelease>('releases/latest');
}
