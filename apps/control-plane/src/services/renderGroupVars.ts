import { writeFileSync } from 'node:fs';

import { stringify } from 'yaml';

import { listEnabledAdminKeys } from '@/db/adminKeys';
import { env } from '@/env';
import { getAutomationPublicKey } from '@/services/automationKey';

export interface GroupVarsInput {
  adminKeys: string[];
  railwayRegionSlugs: string[];
  automationPubkey: string;
  githubRepo: string;
  ingestUrl: string;
}

export function renderGroupVarsYaml(input: GroupVarsInput): string {
  return stringify({
    admin_keys: input.adminKeys,
    railway_region_slugs: input.railwayRegionSlugs,
    automation_pubkey: input.automationPubkey,
    github_repo: input.githubRepo,
    ingest_url: input.ingestUrl,
  });
}

export async function renderGroupVars(path: string): Promise<void> {
  const yaml = renderGroupVarsYaml({
    adminKeys: await listEnabledAdminKeys(),
    railwayRegionSlugs: env.RAILWAY_REPLICA_REGIONS,
    automationPubkey: await getAutomationPublicKey(),
    githubRepo: env.GITHUB_REPO,
    ingestUrl: env.INGEST_URL,
  });
  writeFileSync(path, yaml);
}
