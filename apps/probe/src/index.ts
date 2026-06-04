import express from 'express';

import { env } from '@/env';
import { log } from '@/pino';
import { drainSamples } from '@/probe';

import type { ProbeSample } from '@railway-latency/types';

const app = express();

app.disable('x-powered-by');

app.get('/', (_req, res) => res.status(200).send('OK'));

app.get('/samples', (req, res) => {
  if (
    env.INTERNAL_AUTH_SECRET &&
    req.headers.authorization !== env.INTERNAL_AUTH_SECRET
  ) {
    res.status(401).send('Unauthorized');
    return;
  }

  res.send(drainSamples() satisfies ProbeSample[]);
});

app.listen(env.PORT, '0.0.0.0', () =>
  log.info(`Server listening on 0.0.0.0:${env.PORT}`),
);
