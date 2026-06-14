import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import ejs from 'ejs';

import { env } from '@/env';

function readBootstrapTemplate(): string {
  const candidatePaths = [
    new URL('../templates/bootstrap.sh.ejs', import.meta.url),
    new URL('./templates/bootstrap.sh.ejs', import.meta.url),
  ].map((candidateUrl) => fileURLToPath(candidateUrl));
  const templatePath = candidatePaths.find(existsSync);
  if (!templatePath)
    throw new Error(
      `bootstrap.sh.ejs not found (looked in: ${candidatePaths.join(', ')})`,
    );

  return readFileSync(templatePath, 'utf8');
}

const templateSource = readBootstrapTemplate();

export function installCommand(token: string): string {
  return `curl -fsSL ${env.PUBLIC_BASE_URL}/enroll/${token}/bootstrap.sh | sudo ET=${token} bash`;
}

export interface BootstrapScriptInput {
  token: string;
  adminKeys: string[];
  automationPublicKey: string;
  publicBaseUrl: string;
}

export function renderBootstrapScript(input: BootstrapScriptInput): string {
  const authorizedKeysBlock = [...input.adminKeys, input.automationPublicKey]
    .map((key) => key.trim())
    .filter(Boolean)
    .join('\n');

  return ejs.render(templateSource, {
    authorizedKeysBlock,
    publicBaseUrl: input.publicBaseUrl,
    enrollToken: input.token,
  });
}
