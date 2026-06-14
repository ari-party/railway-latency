import { Router } from 'express';
import { z } from 'zod';

import { createAdminKey, deleteAdminKey, listAdminKeys } from '@/db/adminKeys';
import { validateMiddleware } from '@/middleware/validate';

const adminKeysRouter = Router();

const createSchema = z.object({
  label: z.string().min(1),
  // Single-line match: an embedded newline would inject extra authorized_keys lines.
  publicKey: z.string().regex(/^(ssh-ed25519|ssh-rsa|ecdsa-)[^\r\n]*$/),
});

adminKeysRouter.get('/', async (_request, response) => {
  response.status(200).json(await listAdminKeys());
});

adminKeysRouter.post(
  '/',
  validateMiddleware(createSchema),
  async (request, response) => {
    const body = request.body as z.infer<typeof createSchema>;
    response.status(201).json(await createAdminKey(body.label, body.publicKey));
  },
);

adminKeysRouter.delete('/:id', async (request, response) => {
  // Reject non-uuid here; the uuid column would otherwise raise a Postgres invalid-input 500.
  if (!z.string().uuid().safeParse(request.params.id).success) {
    response.status(400).json({ message: 'invalid admin key id' });
    return;
  }
  const deleted = await deleteAdminKey(request.params.id);
  if (!deleted) {
    response.status(404).json({ message: 'not found' });
    return;
  }
  response.status(204).end();
});

export default adminKeysRouter;
