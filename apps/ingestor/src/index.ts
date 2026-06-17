import express from 'express';

import { env } from '@/env';
import { requireProbeAuth } from '@/middleware/probeAuth';
import { log } from '@/pino';
import { createIngestRouter } from '@/routes/ingest';
import { writeExternalChecks } from '@/services/clickhouse';
import {
  closeWriteApi,
  writeExternalErrors,
  writeExternalSamples,
} from '@/services/influxdb';
import { createRateLimiter } from '@/services/rateLimit';
import { createRoster } from '@/services/roster';
import { createSeenReporter } from '@/services/seen';

import type { RosterCache } from '@/services/roster';
import type { SeenReporter } from '@/services/seen';
import type { ErrorRequestHandler, Express } from 'express';

export function createApp(
  options: { roster?: RosterCache; seenReporter?: SeenReporter } = {},
): Express {
  const roster = options.roster ?? createRoster();
  const rateLimiter = createRateLimiter({ capacity: 10, refillPerSecond: 2 });
  const seenReporter = options.seenReporter ?? createSeenReporter();

  const ingestRouter = createIngestRouter({
    rateLimiter,
    writeExternalSamples,
    writeExternalErrors,
    writeExternalChecks,
    seenReporter,
  });

  const app = express();

  app.disable('x-powered-by');

  app.get('/', (_request, response) => response.status(200).send('OK'));

  app.use(
    '/ingest',
    requireProbeAuth(roster),
    express.json({ limit: '512kb' }),
    ingestRouter,
  );

  // Express identifies an error handler by its four-argument signature, so unused next must stay.
  const handleError: ErrorRequestHandler = (
    error,
    _request,
    response,
    _next,
  ) => {
    const status = Number(error?.status ?? error?.statusCode) || 500;

    if (status >= 500)
      log.error({ name: 'ingestor', err: error }, 'Unhandled request error');

    const message = status >= 500 ? 'Internal server error' : 'Bad request';
    response.status(status).json({ message });
  };

  app.use(handleError);

  return app;
}

if (process.env.NODE_ENV !== 'test') {
  const roster = createRoster();
  const seenReporter = createSeenReporter();

  roster
    .refresh()
    .catch((error) =>
      log.error(
        { name: 'roster', err: error },
        'Initial roster refresh failed',
      ),
    );

  setInterval(() => {
    roster.refresh().catch(() => {});
  }, env.ROSTER_REFRESH_MS);

  const app = createApp({ roster, seenReporter });
  app.listen(env.PORT, '0.0.0.0', () =>
    log.info(`Server listening on 0.0.0.0:${env.PORT}`),
  );

  let isShuttingDown = false;
  const onShutdown = async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    await seenReporter.flush();

    await closeWriteApi()
      .then(() => log.info({ name: 'influxdb' }, 'Closed write API'))
      .catch((error) =>
        log.error(
          { name: 'influxdb', err: error },
          'Failed to close write API',
        ),
      );

    process.exit(0);
  };

  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, onShutdown);
}
