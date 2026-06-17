import { createClient } from '@clickhouse/client';

import type { ClickHouseClient } from '@clickhouse/client';

export interface CheckEventClientConfig {
  url: string;
  username: string;
  password: string;
  database: string;
}

export function createCheckEventClient(
  config: CheckEventClientConfig,
): ClickHouseClient {
  return createClient(config);
}
