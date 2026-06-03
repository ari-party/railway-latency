import { Router } from 'express';

import { getLastMtr } from '@/mtr';

const mtrRouter = Router();

mtrRouter.post('/last', (_req, res) => res.status(200).send(getLastMtr()));

export default mtrRouter;
