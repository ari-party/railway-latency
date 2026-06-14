import ky, { HTTPError } from 'ky';

import { env } from '@/env';

const CACHE_TTL_MS = 5 * 60 * 1_000;

interface CachedRelease {
  sha: string;
  at: number;
}

const releaseCache = new Map<string, CachedRelease>();

const GITHUB_HEADERS = { accept: 'application/vnd.github+json' };

function shaFromProbeTag(tagName: string): string {
  const sha = tagName.replace(/^probe-/, '');
  if (!/^[0-9a-f]{7,40}$/.test(sha))
    throw new Error(
      `release tag ${tagName} is not a probe SHA tag; refusing to deploy it`,
    );
  return sha;
}

async function latestStableSha(): Promise<string> {
  const { tag_name: tagName } = await ky
    .get(`https://api.github.com/repos/${env.GITHUB_REPO}/releases/latest`, {
      headers: GITHUB_HEADERS,
    })
    .json<{ tag_name: string }>();
  return shaFromProbeTag(tagName);
}

async function latestPrereleaseSha(): Promise<string> {
  const releases = await ky
    .get(
      `https://api.github.com/repos/${env.GITHUB_REPO}/releases?per_page=100`,
      { headers: GITHUB_HEADERS },
    )
    .json<Array<{ tag_name: string; prerelease: boolean }>>();
  const newest = releases.find((release) => release.prerelease);
  if (!newest)
    throw new Error(
      'no prerelease found for the dev channel; refusing to serve a stable build to dev probes',
    );
  return shaFromProbeTag(newest.tag_name);
}

export async function latestReleaseSha(): Promise<string> {
  const environment = env.RAILWAY_ENVIRONMENT_NAME;
  const cached = releaseCache.get(environment);

  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.sha;

  const sha =
    environment === 'prod'
      ? await latestStableSha()
      : await latestPrereleaseSha();

  releaseCache.set(environment, { sha, at: Date.now() });

  return sha;
}

export async function releaseTagExists(sha: string): Promise<boolean> {
  try {
    await ky
      .get(
        `https://api.github.com/repos/${env.GITHUB_REPO}/releases/tags/probe-${sha}`,
        { headers: GITHUB_HEADERS },
      )
      .json();
    return true;
  } catch (error) {
    // Only a real 404 means absent; a transient 403/5xx/network error must surface so the caller answers 503, not 422.
    if (error instanceof HTTPError && error.response.status === 404)
      return false;
    throw error;
  }
}
