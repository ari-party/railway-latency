import {
  buildCheckEventRow,
  createCheckEventClient,
  insertCheckEvents,
} from '@railway-latency/clickhouse';

import { env } from '@/env';
import { log } from '@/pino';
import { isTrustedDestination, withinTimeWindow } from '@/services/guards';

import type { RosterProbe } from '@/types';
import type { CheckEventRow } from '@railway-latency/clickhouse';
import type { CheckEvent } from '@railway-latency/types';

const client = createCheckEventClient({
  url: env.CLICKHOUSE_URL,
  username: env.CLICKHOUSE_USERNAME,
  password: env.CLICKHOUSE_PASSWORD,
  database: env.CLICKHOUSE_DATABASE,
});

export function writeExternalChecks(probe: RosterProbe, checks: CheckEvent[]) {
  const now = Date.now();
  const rows: CheckEventRow[] = [];
  let droppedUntrustedDestinations = 0;

  for (const check of checks) {
    if (check.network === 'private') continue;
    if (!withinTimeWindow(check.time, now)) continue;
    if (!isTrustedDestination(check.dst)) {
      droppedUntrustedDestinations += 1;
      continue;
    }
    rows.push(buildCheckEventRow(probe.probeId, check));
  }

  if (droppedUntrustedDestinations > 0)
    log.warn(
      {
        name: 'clickhouse',
        probeId: probe.probeId,
        droppedUntrustedDestinations,
      },
      'Dropped check events for untrusted destinations',
    );

  if (rows.length > 0)
    insertCheckEvents(client, rows).catch((error) =>
      log.error(
        { name: 'clickhouse', err: error, rows: rows.length },
        'ClickHouse insert failed',
      ),
    );
}
