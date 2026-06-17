import compression from 'compression';
import express from 'express';

import { env } from '@/env';
import { log } from '@/pino';
import alertsRouter from '@/routes/alerts';
import queryRouter from '@/routes/query';
import { runStartupMigrations } from '@/services/clickhouse';

const app = express();

app.use(express.json());
app.use(compression());
app.disable('x-powered-by');

app.get('/', (_req, res) => res.status(200).send('OK'));

app.use('/query', queryRouter);
app.use('/alerts', alertsRouter);

runStartupMigrations()
  .then(() =>
    app.listen(env.PORT, '0.0.0.0', () =>
      log.info(`Server listening on 0.0.0.0:${env.PORT}`),
    ),
  )
  .catch((error) => {
    log.error(error, 'ClickHouse startup migration failed; exiting');
    process.exit(1);
  });
