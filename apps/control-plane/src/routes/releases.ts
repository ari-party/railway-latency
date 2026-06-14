import { Router } from 'express';

import { latestReleaseSha } from '@/services/releases';

const releasesRouter = Router();

releasesRouter.get('/latest', async (_request, response) => {
  try {
    response.status(200).json({ sha: await latestReleaseSha() });
  } catch {
    response.status(200).json({ sha: null });
  }
});

export default releasesRouter;
