import express from 'express';

import { env } from '@/env';
import { getLastMtr } from '@/mtr';
import { log } from '@/pino';
import { getLastResults } from '@/probe';

import type { MtrProbe, Probe } from '@railway-latency/types';

const app = express();

app.disable('x-powered-by');

app.get('/', (_req, res) => res.status(200).send('OK'));

app.get('/probe', (_req, res) => res.send(getLastResults() satisfies Probe));

app.get('/mtr', (_req, res) => res.send(getLastMtr() satisfies MtrProbe));

app.listen(env.PORT, '0.0.0.0', () =>
  log.info(`Server listening on 0.0.0.0:${env.PORT}`),
);
