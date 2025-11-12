import express from 'express';

import { env } from '@/env';
import { log } from '@/pino';
import { getLastResults } from '@/probe';

import type { Probe } from '@railway-latency/types';

const app = express();

app.disable('x-powered-by');

app.get('/', (_req, res) => res.status(200).send('OK'));

app.get('/probe', (_req, res) => {
  const [results, measuredAt] = getLastResults();

  res.send({
    time: measuredAt ?? Date.now(),
    results,
  } satisfies Probe);
});

app.listen(env.PORT, '0.0.0.0', () =>
  log.info(`Server listening on 0.0.0.0:${env.PORT}`),
);
