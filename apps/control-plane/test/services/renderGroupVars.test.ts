import '../helpers/db';

import { describe, expect, it } from 'vitest';

import { parse } from 'yaml';

import { renderGroupVarsYaml } from '@/services/renderGroupVars';

describe('renderGroupVarsYaml', () => {
  it('emits admin keys, region slugs, and the ingest url', () => {
    const yaml = renderGroupVarsYaml({
      adminKeys: ['ssh-ed25519 AAAAadmin admin@laptop'],
      railwayRegionSlugs: ['us-west1', 'europe-west4'],
      automationPubkey: 'ssh-ed25519 AAAAauto fleet-automation',
      githubRepo: 'ari-party/railway-latency',
      ingestUrl: 'https://ingest.example/ingest',
    });
    const parsed = parse(yaml) as Record<string, unknown>;
    expect(parsed.admin_keys).toEqual(['ssh-ed25519 AAAAadmin admin@laptop']);
    expect(parsed.railway_region_slugs).toEqual(['us-west1', 'europe-west4']);
    expect(parsed.automation_pubkey).toBe(
      'ssh-ed25519 AAAAauto fleet-automation',
    );
    expect(parsed.ingest_url).toBe('https://ingest.example/ingest');
  });
});
