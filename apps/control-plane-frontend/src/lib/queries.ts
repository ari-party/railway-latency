import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { toaster } from '@/components/ui';
import { ClientError, clientRequest } from '@/lib/client';

import type {
  AdminKey,
  CreateAdminKeyInput,
  CreateProbeInput,
  LatestRelease,
  PatchedProbe,
  PatchProbeInput,
  Probe,
  ProbeEnrollment,
  RotatedKey,
  UpdateAllResult,
  UpdateProbeResult,
} from '@railway-latency/types';
import type {
  QueryClient,
  QueryKey,
  UseMutationResult,
  UseQueryResult,
} from '@tanstack/react-query';

export const queryKeys = {
  probes: ['probes'] as const,
  probe: (probeId: string) => ['probes', probeId] as const,
  latestRelease: ['releases', 'latest'] as const,
  adminKeys: ['admin-keys'] as const,
};

function errorMessage(error: unknown): string {
  if (error instanceof ClientError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}

function errorToast(title: string) {
  return (error: unknown) => {
    toaster.create({ type: 'error', title, description: errorMessage(error) });
  };
}

function invalidate(queryClient: QueryClient, ...keys: QueryKey[]): void {
  for (const queryKey of keys) {
    void queryClient.invalidateQueries({ queryKey });
  }
}

export function useProbes(): UseQueryResult<Probe[]> {
  return useQuery({
    queryKey: queryKeys.probes,
    queryFn: () => clientRequest<Probe[]>('probes'),
    refetchInterval: 15 * 1_000,
  });
}

export function useLatestRelease(): UseQueryResult<LatestRelease> {
  return useQuery({
    queryKey: queryKeys.latestRelease,
    queryFn: () => clientRequest<LatestRelease>('releases/latest'),
    staleTime: 60 * 1_000,
  });
}

export function useAdminKeys(): UseQueryResult<AdminKey[]> {
  return useQuery({
    queryKey: queryKeys.adminKeys,
    queryFn: () => clientRequest<AdminKey[]>('admin-keys'),
  });
}

export function useCreateProbe(): UseMutationResult<
  ProbeEnrollment,
  unknown,
  CreateProbeInput
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProbeInput) =>
      clientRequest<ProbeEnrollment>('probes', { method: 'POST', body: input }),
    onSuccess: (_data, input) => {
      invalidate(queryClient, queryKeys.probes);
      toaster.create({
        type: 'success',
        title: `Probe ${input.probeId} created`,
      });
    },
    onError: errorToast('Create failed'),
  });
}

export function usePatchProbe(
  probeId: string,
): UseMutationResult<PatchedProbe, unknown, PatchProbeInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PatchProbeInput) =>
      clientRequest<PatchedProbe>(`probes/${encodeURIComponent(probeId)}`, {
        method: 'PATCH',
        body: input,
      }),
    onSuccess: () => {
      invalidate(queryClient, queryKeys.probes, queryKeys.probe(probeId));
      toaster.create({ type: 'success', title: 'Probe updated' });
    },
    onError: errorToast('Update failed'),
  });
}

export function useRotateProbeKey(
  probeId: string,
): UseMutationResult<RotatedKey, unknown, void> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      clientRequest<RotatedKey>(
        `probes/${encodeURIComponent(probeId)}/key/rotate`,
        {
          method: 'POST',
        },
      ),
    onSuccess: () => {
      invalidate(queryClient, queryKeys.probes);
      toaster.create({
        type: 'success',
        title: 'Key rotated',
        description: 'Copy it now. It is shown once.',
      });
    },
    onError: errorToast('Rotation failed'),
  });
}

export function useRevokeProbeKey(
  probeId: string,
): UseMutationResult<{ status: string }, unknown, void> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      clientRequest<{ status: string }>(
        `probes/${encodeURIComponent(probeId)}/key/revoke`,
        {
          method: 'POST',
        },
      ),
    onSuccess: () => {
      invalidate(queryClient, queryKeys.probes);
      toaster.create({ type: 'success', title: 'Key revoked' });
    },
    onError: errorToast('Revoke failed'),
  });
}

export function useDisableProbe(
  probeId: string,
): UseMutationResult<{ status: string }, unknown, void> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      clientRequest<{ status: string }>(
        `probes/${encodeURIComponent(probeId)}/disable`,
        {
          method: 'POST',
        },
      ),
    onSuccess: () => {
      invalidate(queryClient, queryKeys.probes);
      toaster.create({ type: 'success', title: 'Probe disabled' });
    },
    onError: errorToast('Disable failed'),
  });
}

export function useUpdateProbe(
  probeId: string,
): UseMutationResult<UpdateProbeResult, unknown, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sha: string) =>
      clientRequest<UpdateProbeResult>(
        `probes/${encodeURIComponent(probeId)}/update`,
        {
          method: 'POST',
          body: { sha },
        },
      ),
    onSuccess: () => {
      invalidate(queryClient, queryKeys.probes);
      toaster.create({ type: 'success', title: 'Update started' });
    },
    onError: errorToast('Update failed'),
  });
}

export function useUpdateAllProbes(): UseMutationResult<
  UpdateAllResult,
  unknown,
  string
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (sha: string) =>
      clientRequest<UpdateAllResult>('probes/update-all', {
        method: 'POST',
        body: { sha },
      }),
    onSuccess: (result) => {
      invalidate(queryClient, queryKeys.probes);
      toaster.create({
        type: 'success',
        title: 'Fleet update started',
        description: `${result.started} probe(s) converging.`,
      });
    },
    onError: errorToast('Fleet update failed'),
  });
}

interface DeleteProbeVariables {
  force?: boolean;
}

export function useDeleteProbe(
  probeId: string,
): UseMutationResult<void, unknown, DeleteProbeVariables | void> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: DeleteProbeVariables | void) =>
      clientRequest<void>(`probes/${encodeURIComponent(probeId)}`, {
        method: 'DELETE',
        query: { force: variables?.force ? 'true' : undefined },
      }),
    onSuccess: () => {
      invalidate(queryClient, queryKeys.probes);
      toaster.create({ type: 'success', title: `Probe ${probeId} deleted` });
    },
    onError: errorToast('Teardown failed'),
  });
}

export function useCreateAdminKey(): UseMutationResult<
  AdminKey,
  unknown,
  CreateAdminKeyInput
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAdminKeyInput) =>
      clientRequest<AdminKey>('admin-keys', { method: 'POST', body: input }),
    onSuccess: () => {
      invalidate(queryClient, queryKeys.adminKeys);
      toaster.create({ type: 'success', title: 'Admin key added' });
    },
    onError: errorToast('Add failed'),
  });
}

export function useDeleteAdminKey(): UseMutationResult<void, unknown, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      clientRequest<void>(`admin-keys/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      invalidate(queryClient, queryKeys.adminKeys);
      toaster.create({ type: 'success', title: 'Admin key removed' });
    },
    onError: errorToast('Remove failed'),
  });
}
