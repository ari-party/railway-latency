import type { RequestOptions } from '@/lib/http';

export class ClientError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ClientError';
    this.status = status;
  }
}

function buildPath(path: string, query?: RequestOptions['query']): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, value);
  }
  const queryString = params.toString();
  return queryString ? `${path}?${queryString}` : path;
}

export async function clientRequest<TResponse>(
  path: string,
  options: RequestOptions = {},
): Promise<TResponse> {
  const { body, method = 'GET', query } = options;

  const response = await fetch(buildPath(`/api/${path}`, query), {
    method,
    headers:
      body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 204) {
    return undefined as TResponse;
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
      `request failed (${response.status})`;
    throw new ClientError(response.status, message);
  }

  return parsed as TResponse;
}
