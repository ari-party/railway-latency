import express from 'express';

import { requireInternalToken } from '@/middleware/internalToken';
import { log } from '@/pino';
import adminKeysRouter from '@/routes/adminKeys';
import enrollRouter from '@/routes/enroll';
import internalRouter from '@/routes/internal';
import probesRouter from '@/routes/probes';
import releasesRouter from '@/routes/releases';

import type { ErrorRequestHandler } from 'express';

function statusForError(error: { status?: unknown; statusCode?: unknown }) {
  if (typeof error?.status === 'number') return error.status;
  if (typeof error?.statusCode === 'number') return error.statusCode;
  return 500;
}

function clientMessageForError(error: { message?: unknown }, status: number) {
  if (status >= 500) return 'internal server error';
  if (typeof error?.message === 'string') return error.message;
  return 'bad request';
}

export function buildApp() {
  const app = express();
  app.use(express.json());
  app.disable('x-powered-by');

  app.get('/', (_request, response) => response.status(200).send('OK'));

  app.use('/probes', requireInternalToken, probesRouter);
  app.use('/admin-keys', requireInternalToken, adminKeysRouter);
  app.use('/releases', requireInternalToken, releasesRouter);
  app.use('/internal', requireInternalToken, internalRouter);
  app.use('/enroll', enrollRouter);

  // Express only treats a handler as the terminal error sink if it declares all four parameters, so `_next` stays.
  const errorHandler: ErrorRequestHandler = (
    error,
    _request,
    response,
    _next,
  ) => {
    const status = statusForError(error);
    if (status >= 500) log.error({ error }, 'unhandled request error');
    response
      .status(status)
      .json({ message: clientMessageForError(error, status) });
  };
  app.use(errorHandler);

  return app;
}
