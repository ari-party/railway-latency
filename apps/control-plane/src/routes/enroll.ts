import { Router } from 'express';

import { listEnabledAdminKeys } from '@/db/adminKeys';
import { consumeEnrollmentToken } from '@/db/enrollmentTokens';
import { recordEvent } from '@/db/events';
import { pool } from '@/db/pool';
import { setProbeApiKey, setProbeHost } from '@/db/probes';
import { env } from '@/env';
import { log } from '@/pino';
import { runPlaybook } from '@/services/ansible';
import { mintApiKey, sha256 } from '@/services/apikey';
import { getAutomationPublicKey } from '@/services/automationKey';
import { renderBootstrapScript } from '@/services/install';
import { lookupAsn } from '@/services/ip2location';
import { latestReleaseSha } from '@/services/releases';
import { secretStash } from '@/services/secretStash';

const ENROLL_STASH_TTL_MS = 10 * 60 * 1_000;

const enrollRouter = Router();

enrollRouter.get('/:token/bootstrap.sh', async (request, response) => {
  const tokenHash = sha256(request.params.token);
  const tokenRow = await pool.query<{ valid: boolean }>(
    `select (used_at is null and now() <= expires_at) as valid
     from enrollment_tokens where token_hash = $1`,
    [tokenHash],
  );
  if (tokenRow.rows.length === 0 || !tokenRow.rows[0].valid) {
    response.status(404).send('not found');
    return;
  }

  const script = renderBootstrapScript({
    token: request.params.token,
    adminKeys: await listEnabledAdminKeys(),
    automationPublicKey: await getAutomationPublicKey(),
    publicBaseUrl: env.PUBLIC_BASE_URL,
  });
  response.status(200).type('text/x-shellscript').send(script);
});

enrollRouter.post('/callhome', async (request, response) => {
  const token = request.get('authorization')?.replace(/^Bearer /, '');
  if (!token) {
    response.status(401).json({ message: 'missing token' });
    return;
  }

  const result = await consumeEnrollmentToken(sha256(token));

  switch (result.outcome) {
    case 'ok': {
      const { probeId } = result;
      await recordEvent(probeId, 'enrolled');

      const minted = mintApiKey(probeId);
      await setProbeApiKey(probeId, {
        hash: minted.hash,
        prefix: minted.prefix,
      });
      secretStash.put(probeId, { apiKey: minted.token }, ENROLL_STASH_TTL_MS);

      const forwardedHost = request
        .get('x-forwarded-for')
        ?.split(',')[0]
        ?.trim();
      if (forwardedHost) {
        const asn = await lookupAsn(forwardedHost);
        await setProbeHost(probeId, forwardedHost, asn);
      }

      response.status(200).json({ status: 'enrolled' });

      void (async () => {
        let sha: string;
        try {
          sha = await latestReleaseSha();
        } catch {
          await recordEvent(probeId, 'enroll_deferred', {
            reason: 'no probe release available yet',
          });
          return;
        }

        void runPlaybook({
          probeId,
          playbook: 'converge',
          probeSha: sha,
        }).catch(async (error: unknown) => {
          const reason = error instanceof Error ? error.message : String(error);
          log.error({ probeId, error }, 'enroll converge rejected');
          await recordEvent(probeId, 'enroll_deferred', { reason });
        });
      })();
      break;
    }
    case 'already_enrolled':
      response.status(409).json({ status: 'already_enrolled' });
      break;
    case 'unknown':
      response.status(401).json({ message: 'unknown token' });
      break;
    case 'consumed':
    case 'expired':
      response.status(410).json({ message: 'token no longer valid' });
      break;
    default:
      response.status(500).json({ message: 'unexpected outcome' });
  }
});

export default enrollRouter;
