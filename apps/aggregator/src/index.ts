import compression from 'compression';
import express from 'express';

import { env } from '@/env';
import { log } from '@/pino';
import queryRouter from '@/routes/query';
import streamRouter from '@/routes/stream';

const app = express();

app.use(express.json());
app.use(compression());
app.disable('x-powered-by');

app.get('/', (_req, res) => res.status(200).send('OK'));

app.use('/query', queryRouter);
app.use('/stream', streamRouter);

app.listen(env.PORT, '0.0.0.0', () =>
  log.info(`Server listening on 0.0.0.0:${env.PORT}`),
);
