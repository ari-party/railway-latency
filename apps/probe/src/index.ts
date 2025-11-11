import express from 'express';

import { env } from '@/env';
import { log } from '@/pino';
import { getLastResults } from '@/probe';

const app = express();

app.disable('x-powered-by');

app.get('/', (_req, res) => res.status(200).send('OK'));

app.get('/probe', (_req, res) => {
  const [http, dns] = getLastResults();

  res.send({
    time: Date.now(),
    http,
    dns,
  });
});

app.listen(env.PORT, '0.0.0.0', () =>
  log.info(`Server listening on 0.0.0.0:${env.PORT}`),
);
