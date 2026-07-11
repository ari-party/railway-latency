import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const clientMock = {
  fetchProbes: vi.fn(),
  createMeasurement: vi.fn(),
  pollMeasurement: vi.fn(),
};
const storeMock = {
  storeResult: vi.fn(),
  listRecent: vi.fn(),
  getResult: vi.fn(),
};

vi.mock('./client', () => clientMock);
vi.mock('./store', () => storeMock);
vi.mock('./queue', () => ({
  withRunLock: (fn: () => Promise<unknown>) => fn(),
}));

async function makeCaller(user: { email: string } | null) {
  const { createCallerFactory, createTRPCRouter } = await import(
    '@/server/api/trpc/context'
  );
  const { globalpingRouter } = await import('./index');
  const appRouter = createTRPCRouter({ globalping: globalpingRouter });
  return createCallerFactory(appRouter)({ user });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.stubEnv('AUTH_ALLOWED_EMAILS', 'ok@example.com');
  vi.stubEnv('RAILWAY_REPLICA_REGIONS', 'us-east4-eqdc4a');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('globalping auth gate', () => {
  it('rejects an unauthenticated caller', async () => {
    const caller = await makeCaller(null);
    await expect(caller.globalping.list()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('rejects a non-allowlisted caller', async () => {
    const caller = await makeCaller({ email: 'nope@example.com' });
    await expect(caller.globalping.list()).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

describe('globalping.measure', () => {
  it('rejects an unknown destination region', async () => {
    const caller = await makeCaller({ email: 'ok@example.com' });
    await expect(
      caller.globalping.measure({
        type: 'http',
        dst: 'mars-1',
        location: { country: 'DE' },
        limit: 10,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('rejects an empty location', async () => {
    const caller = await makeCaller({ email: 'ok@example.com' });
    await expect(
      caller.globalping.measure({
        type: 'http',
        dst: 'us-east4-eqdc4a',
        location: {},
        limit: 10,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('creates, polls, parses and stores a measurement', async () => {
    clientMock.createMeasurement.mockResolvedValue('meas-1');
    clientMock.pollMeasurement.mockResolvedValue({ results: [] });
    storeMock.storeResult.mockResolvedValue(undefined);

    const caller = await makeCaller({ email: 'ok@example.com' });
    const result = await caller.globalping.measure({
      type: 'http',
      dst: 'us-east4-eqdc4a',
      location: { country: 'DE' },
      limit: 5,
    });

    expect(clientMock.createMeasurement).toHaveBeenCalledWith({
      type: 'http',
      target: 'us-east4-eqdc4a-echo.up.railway.app',
      location: { country: 'DE' },
      limit: 5,
    });
    expect(result.id).toBe('meas-1');
    expect(storeMock.storeResult).toHaveBeenCalledOnce();
  });
});
