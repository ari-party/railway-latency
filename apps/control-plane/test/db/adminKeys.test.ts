import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase, testPool } from '../helpers/db';
import {
  createAdminKey,
  deleteAdminKey,
  listAdminKeys,
  listEnabledAdminKeys,
} from '@/db/adminKeys';
import { runMigrations } from '@/db/migrate';

describe('admin keys db', () => {
  beforeEach(async () => {
    await resetDatabase();
    await runMigrations();
  });

  afterAll(async () => {
    await testPool.end();
  });

  it('creates, lists and deletes admin keys', async () => {
    const key = await createAdminKey('astrid', 'ssh-ed25519 AAAA astrid');
    expect(await listAdminKeys()).toHaveLength(1);
    expect(await listEnabledAdminKeys()).toEqual(['ssh-ed25519 AAAA astrid']);
    await deleteAdminKey(key.id);
    expect(await listAdminKeys()).toHaveLength(0);
  });
});
