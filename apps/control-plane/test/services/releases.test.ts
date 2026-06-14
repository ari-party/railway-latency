import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let environmentName = 'prod';

vi.mock('@/env', () => ({
  env: {
    get GITHUB_REPO() {
      return 'ari-party/railway-latency';
    },
    get RAILWAY_ENVIRONMENT_NAME() {
      return environmentName;
    },
  },
}));

class FakeHTTPError extends Error {
  response: { status: number };

  constructor(status: number) {
    super(`HTTP ${status}`);
    this.response = { status };
  }
}

const responseByUrl = new Map<string, unknown>();
const errorByUrl = new Map<string, unknown>();

vi.mock('ky', () => ({
  HTTPError: FakeHTTPError,
  default: {
    get: (url: string) => ({
      json: () => {
        for (const [needle, error] of errorByUrl) {
          if (url.includes(needle)) return Promise.reject(error);
        }
        for (const [needle, value] of responseByUrl) {
          if (url.includes(needle)) return Promise.resolve(value);
        }
        return Promise.reject(new Error(`no mock for ${url}`));
      },
    }),
  },
}));

async function importReleases() {
  vi.resetModules();
  return import('@/services/releases');
}

describe('releases service', () => {
  beforeEach(() => {
    environmentName = 'prod';
    responseByUrl.clear();
    errorByUrl.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('prod resolves from /releases/latest and strips the probe- prefix', async () => {
    environmentName = 'prod';
    responseByUrl.set('/releases/latest', { tag_name: 'probe-9bd78c0' });
    const { latestReleaseSha } = await importReleases();
    expect(await latestReleaseSha()).toBe('9bd78c0');
  });

  it('dev picks the newest prerelease from the releases listing', async () => {
    environmentName = 'dev';
    responseByUrl.set('/releases?per_page=100', [
      { tag_name: 'probe-feedbac', prerelease: true },
      { tag_name: 'probe-5deadb0', prerelease: false },
    ]);
    const { latestReleaseSha } = await importReleases();
    expect(await latestReleaseSha()).toBe('feedbac');
  });

  it('dev throws rather than serving a stable build when no prerelease exists', async () => {
    environmentName = 'dev';
    responseByUrl.set('/releases?per_page=100', [
      { tag_name: 'probe-5deadb0', prerelease: false },
    ]);
    responseByUrl.set('/releases/latest', { tag_name: 'probe-5deadb0' });
    const { latestReleaseSha } = await importReleases();
    await expect(latestReleaseSha()).rejects.toThrow('no prerelease found');
  });

  it('rejects a non probe- tag rather than deploying a bogus SHA', async () => {
    environmentName = 'prod';
    responseByUrl.set('/releases/latest', { tag_name: 'v1.2.3' });
    const { latestReleaseSha } = await importReleases();
    await expect(latestReleaseSha()).rejects.toThrow('not a probe SHA tag');
  });

  it('reports whether a tag exists', async () => {
    responseByUrl.set('/releases/tags/probe-abc1234', {
      tag_name: 'probe-abc1234',
    });
    const { releaseTagExists } = await importReleases();
    expect(await releaseTagExists('abc1234')).toBe(true);
  });

  it('treats a real 404 as the tag being absent', async () => {
    errorByUrl.set('/releases/tags/probe-ffffff0', new FakeHTTPError(404));
    const { releaseTagExists } = await importReleases();
    expect(await releaseTagExists('ffffff0')).toBe(false);
  });

  it('surfaces a rate-limit (403) instead of reporting the tag as absent', async () => {
    errorByUrl.set('/releases/tags/probe-abc1234', new FakeHTTPError(403));
    const { releaseTagExists } = await importReleases();
    await expect(releaseTagExists('abc1234')).rejects.toBeInstanceOf(
      FakeHTTPError,
    );
  });

  it('surfaces a 5xx instead of reporting the tag as absent', async () => {
    errorByUrl.set('/releases/tags/probe-abc1234', new FakeHTTPError(503));
    const { releaseTagExists } = await importReleases();
    await expect(releaseTagExists('abc1234')).rejects.toBeInstanceOf(
      FakeHTTPError,
    );
  });

  it('surfaces a network error instead of reporting the tag as absent', async () => {
    errorByUrl.set('/releases/tags/probe-abc1234', new Error('ECONNRESET'));
    const { releaseTagExists } = await importReleases();
    await expect(releaseTagExists('abc1234')).rejects.toThrow('ECONNRESET');
  });
});
