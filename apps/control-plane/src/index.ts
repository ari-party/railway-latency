import { buildApp } from '@/app';
import { runMigrations } from '@/db/migrate';
import { env } from '@/env';
import { log } from '@/pino';
import { getAutomationPublicKey } from '@/services/automationKey';

process.on('unhandledRejection', (reason) => {
  log.error({ err: reason }, 'unhandled promise rejection');
});
process.on('uncaughtException', (error) => {
  log.error({ err: error }, 'uncaught exception');
});

async function main() {
  await getAutomationPublicKey();
  await runMigrations();
  const app = buildApp();
  app.listen(env.PORT, '0.0.0.0', () =>
    log.info(`Control plane listening on 0.0.0.0:${env.PORT}`),
  );
}

main().catch((error) => {
  log.error(error, 'control plane failed to start');
  process.exit(1);
});
