import { Router } from 'express';

import { BatchSSE } from '@/lib/batch-sse';

const streamRouter = Router();

export const sse = new BatchSSE(15);

streamRouter.get('/events', sse.init);

export default streamRouter;
