import express from 'express';

import { getLastResults } from '@/aggregator';
import { env } from '@/env';
import { log } from '@/pino';

const app = express();

app.disable('x-powered-by');

app.get('/', (_req, res) => res.status(200).send('OK'));

app.get('/query/last', (_req, res) => res.status(200).send(getLastResults()));

app.listen(env.PORT, '0.0.0.0', () =>
  log.info(`Server listening on 0.0.0.0:${env.PORT}`),
);
