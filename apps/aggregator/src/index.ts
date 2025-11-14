import express from 'express';

import { env } from '@/env';
import { log } from '@/pino';
import queryRouter from '@/routes/query';

const app = express();

app.disable('x-powered-by');

app.get('/', (_req, res) => res.status(200).send('OK'));

app.use('/query', queryRouter);

app.listen(env.PORT, '0.0.0.0', () =>
  log.info(`Server listening on 0.0.0.0:${env.PORT}`),
);
