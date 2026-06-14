import pg from 'pg';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgres://postgres:postgres@127.0.0.1:5433/control_plane_test';

process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.NODE_ENV = 'test';
process.env.CONTROL_PLANE_INTERNAL_TOKEN ??= 'test-internal-token';
process.env.AUTOMATION_SSH_KEY_B64 ??= 'YWJj';
process.env.PUBLIC_BASE_URL ??= 'https://cp.test.example.com';
process.env.INGEST_URL ??= 'https://ingest.test.example.com/ingest';
process.env.RAILWAY_ENVIRONMENT_NAME ??= 'prod';
process.env.RAILWAY_REGION_SLUGS ??=
  'europe-west4-drams3a,asia-southeast1-eqsg3a';

export const testPool = new pg.Pool({ connectionString: TEST_DATABASE_URL });

export async function resetDatabase() {
  await testPool.query('drop schema if exists public cascade');
  await testPool.query('create schema public');
}
