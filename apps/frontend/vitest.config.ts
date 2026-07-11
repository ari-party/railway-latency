import path from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    env: {
      APP_URL: 'http://localhost:3000',
      RAILWAY_OAUTH_CLIENT_ID: 'test-client-id',
      RAILWAY_OAUTH_CLIENT_SECRET: 'test-client-secret',
      AUTH_SESSION_SECRET: 'test-session-secret',
      AUTH_ALLOWED_EMAILS: 'ops@example.com',
    },
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
