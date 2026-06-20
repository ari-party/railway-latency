/* eslint-disable no-underscore-dangle -- InfluxDB exposes _time/_value columns */
import { InfluxDB } from '@influxdata/influxdb-client';
import {
  buildSampleRow,
  buildErrorEventRow,
  buildMtrEventRow,
  createCheckEventClient,
  insertSamples,
  insertErrorEvents,
  insertMtrEvents,
} from '@railway-latency/clickhouse';
import { MEASUREMENT_INFO } from '@railway-latency/utils';

import { env } from '@/env';

import type { Measurement, Network, ProbeSample } from '@railway-latency/types';

const SAMPLE_MEASUREMENTS = Object.keys(MEASUREMENT_INFO) as Measurement[];
const DAY_MS = 24 * 60 * 60 * 1_000;
const BACKFILL_WINDOW_MS = 30 * DAY_MS;
const INSERT_BATCH = 25_000;
const CONCURRENCY = 6;

const influxUrl = process.env.INFLUXDB_URL;
const influxToken = process.env.INFLUXDB_TOKEN;
const influxOrg = process.env.INFLUXDB_ORG;
const influxBucket = process.env.INFLUXDB_BUCKET;
if (!influxUrl || !influxToken || !influxOrg || !influxBucket)
  throw new Error(
    'INFLUXDB_URL/TOKEN/ORG/BUCKET must be present (they remain set on the Railway service until Influx is decommissioned)',
  );

const queryApi = new InfluxDB({
  url: influxUrl,
  token: influxToken,
  timeout: 300_000,
}).getQueryApi(influxOrg);
const clickhouse = createCheckEventClient({
  url: env.CLICKHOUSE_URL,
  username: env.CLICKHOUSE_USERNAME,
  password: env.CLICKHOUSE_PASSWORD,
  database: env.CLICKHOUSE_DATABASE,
});

async function resolveBoundaryMs(): Promise<number> {
  const result = await clickhouse.query({
    query:
      'SELECT toUnixTimestamp64Milli(min(time)) AS minMs, count() AS rowCount ' +
      "FROM samples WHERE origin = 'internal'",
    format: 'JSONEachRow',
    clickhouse_settings: { output_format_json_quote_64bit_integers: 0 },
  });
  const [first] = (await result.json()) as Array<{
    minMs: number;
    rowCount: number;
  }>;
  if (!first || first.rowCount === 0) return Date.now();
  return first.minMs;
}

async function clearPriorBackfill(boundaryMs: number): Promise<void> {
  for (const table of ['samples', 'error_events', 'mtr_events'])
    await clickhouse.command({
      query: `ALTER TABLE ${table} DELETE WHERE time < fromUnixTimestamp64Milli(${boundaryMs})`,
      clickhouse_settings: { mutations_sync: '2' },
    });
}

function isoRange(
  fromMs: number,
  toMs: number,
): { start: string; stop: string } {
  return {
    start: new Date(fromMs).toISOString(),
    stop: new Date(toMs).toISOString(),
  };
}

async function streamToClickHouse<Row>(
  flux: string,
  buildRow: (record: Record<string, unknown>) => Row | null,
  insert: (rows: Row[]) => Promise<void>,
): Promise<number> {
  let buffer: Row[] = [];
  let total = 0;
  for await (const { values, tableMeta } of queryApi.iterateRows(flux)) {
    const row = buildRow(tableMeta.toObject(values) as Record<string, unknown>);
    if (row == null) continue;
    buffer.push(row);
    if (buffer.length >= INSERT_BATCH) {
      await insert(buffer);
      total += buffer.length;
      buffer = [];
    }
  }
  if (buffer.length > 0) {
    await insert(buffer);
    total += buffer.length;
  }
  return total;
}

async function backfillSamplesForDay(
  measurement: Measurement,
  fromMs: number,
  toMs: number,
) {
  const { start, stop } = isoRange(fromMs, toMs);
  const flux = `from(bucket: "${influxBucket}")
    |> range(start: ${start}, stop: ${stop})
    |> filter(fn: (r) => r._measurement == "${measurement}")
    |> pivot(rowKey: ["_time", "src", "dst"], columnKey: ["_field"], valueColumn: "_value")`;

  const count = await streamToClickHouse(
    flux,
    (record) => {
      if (record.ms == null) return null;
      const sample: ProbeSample = {
        measurement,
        dst: String(record.dst),
        time: Date.parse(String(record._time)),
        ms: Number(record.ms),
        railwayEdge:
          record.railway_edge == null ? undefined : String(record.railway_edge),
        cfPop: record.cf_pop == null ? undefined : String(record.cf_pop),
        hikariPop:
          record.hikari_pop == null ? undefined : String(record.hikari_pop),
      };
      const origin = record.origin == null ? '' : String(record.origin);
      return buildSampleRow(String(record.src), sample, origin);
    },
    (rows) => insertSamples(clickhouse, rows),
  );
  console.log(`samples ${measurement} ${start}: ${count}`);
}

async function backfillMtrForDay(fromMs: number, toMs: number) {
  const { start, stop } = isoRange(fromMs, toMs);
  const flux = `from(bucket: "${influxBucket}")
    |> range(start: ${start}, stop: ${stop})
    |> filter(fn: (r) => r._measurement == "mtr" and r._field == "hops")`;
  const count = await streamToClickHouse(
    flux,
    (record) =>
      buildMtrEventRow(
        String(record.src),
        {
          measurement: 'httpPublic',
          dst: String(record.dst),
          time: Date.parse(String(record._time)),
          ms: 0,
          mtr: JSON.parse(String(record._value)),
        },
        String(record.network),
      ),
    (rows) => insertMtrEvents(clickhouse, rows),
  );
  console.log(`mtr ${start}: ${count}`);
}

async function backfillErrorsForDay(fromMs: number, toMs: number) {
  const { start, stop } = isoRange(fromMs, toMs);
  const flux = `from(bucket: "${influxBucket}")
    |> range(start: ${start}, stop: ${stop})
    |> filter(fn: (r) => r._measurement == "error" and r._field == "reason")`;
  const count = await streamToClickHouse(
    flux,
    (record) =>
      buildErrorEventRow(
        String(record.src),
        {
          dst: String(record.dst),
          network: String(record.network) as Network,
          time: Date.parse(String(record._time)),
          reason: String(record._value),
        },
        record.origin == null ? '' : String(record.origin),
      ),
    (rows) => insertErrorEvents(clickhouse, rows),
  );
  console.log(`errors ${start}: ${count}`);
}

async function runWithConcurrency(
  thunks: Array<() => Promise<unknown>>,
  limit: number,
): Promise<void> {
  let next = 0;
  async function worker(): Promise<void> {
    while (next < thunks.length) {
      const index = next;
      next += 1;
      await thunks[index]();
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, thunks.length) }, () => worker()),
  );
}

async function main() {
  const boundaryMs = await resolveBoundaryMs();
  const startMs = boundaryMs - BACKFILL_WINDOW_MS;
  console.log(
    `backfilling Influx time < ${new Date(boundaryMs).toISOString()}`,
  );

  await clearPriorBackfill(boundaryMs);

  const tasks: Array<() => Promise<unknown>> = [];
  for (let dayStart = startMs; dayStart < boundaryMs; dayStart += DAY_MS) {
    const windowStart = dayStart;
    const windowEnd = Math.min(dayStart + DAY_MS, boundaryMs);
    for (const measurement of SAMPLE_MEASUREMENTS)
      tasks.push(() =>
        backfillSamplesForDay(measurement, windowStart, windowEnd),
      );
    tasks.push(() => backfillMtrForDay(windowStart, windowEnd));
    tasks.push(() => backfillErrorsForDay(windowStart, windowEnd));
  }

  await runWithConcurrency(tasks, CONCURRENCY);

  await clickhouse.close();
  console.log('backfill complete');
}

await main();
