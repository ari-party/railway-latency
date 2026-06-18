import { PassThrough } from 'node:stream';

import {
  checkQueryScansBody,
  getCheckEventDetail,
  parseCheckQuery,
  queryCheckEvents,
  queryProbeRecentPops,
} from '@railway-latency/clickhouse';
import { getRangeOptionsSchema } from '@railway-latency/utils';
import { Router } from 'express';
import z from 'zod';

import { getLastResults } from '@/aggregator';
import { env } from '@/env';
import { validateMiddleware } from '@/middleware/validate';
import { log } from '@/pino';
import { checkEventClient } from '@/services/clickhouse';
import { queryAPI } from '@/services/influxdb';

import type { FluxTableMetaData } from '@influxdata/influxdb-client';
import type { Request, Response } from 'express';

const queryRouter = Router();

const replicaRegionsEnum = z.enum(
  env.RAILWAY_REPLICA_REGIONS as [string, ...string[]],
);

const nodeSchema = z
  .string()
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/);

const rangeOptionsSchema = getRangeOptionsSchema(
  env.RAILWAY_REPLICA_REGIONS,
).strict();

const errorOptionsSchema = z
  .object({
    src: nodeSchema,
    dst: replicaRegionsEnum,
    network: z.enum(['private', 'public', 'proxied']),
    rangeStart: z.iso.datetime(),
    rangeEnd: z.iso.datetime(),
    aggregateWindow: z.string(),
  })
  .strict();

const sampleFluxQuery = (
  options: z.infer<typeof rangeOptionsSchema>,
) => `from(bucket: "${env.INFLUXDB_BUCKET}")
  |> range(start: ${options.rangeStart}, stop: ${options.rangeEnd})
  |> filter(fn: (r) => ${options.measurements.map((measurement) => `r["_measurement"] == "${measurement}"`).join(' or ')})
  |> filter(fn: (r) => r["_field"] == "ms")
  |> filter(fn: (r) => r["src"] == "${options.src}")
  |> filter(fn: (r) => r["dst"] == "${options.dst}")
  |> aggregateWindow(every: ${options.aggregateWindow}, fn: mean, createEmpty: false)
  |> yield(name: "mean")
`;

const mtrOptionsSchema = z
  .object({
    src: nodeSchema,
    dst: replicaRegionsEnum,
    network: z.enum(['public', 'proxied']),
  })
  .strict();

const mtrFluxQuery = (
  options: z.infer<typeof mtrOptionsSchema>,
) => `from(bucket: "${env.INFLUXDB_BUCKET}")
  |> range(start: -24h)
  |> filter(fn: (r) => r["_measurement"] == "mtr")
  |> filter(fn: (r) => r["_field"] == "hops")
  |> filter(fn: (r) => r["src"] == "${options.src}")
  |> filter(fn: (r) => r["dst"] == "${options.dst}")
  |> filter(fn: (r) => r["network"] == "${options.network}")
  |> last()
`;

function parseHops(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const errorFluxQuery = (
  options: z.infer<typeof errorOptionsSchema>,
) => `from(bucket: "${env.INFLUXDB_BUCKET}")
  |> range(start: ${options.rangeStart}, stop: ${options.rangeEnd})
  |> filter(fn: (r) => r["_measurement"] == "error")
  |> filter(fn: (r) => r["_field"] == "reason")
  |> filter(fn: (r) => r["src"] == "${options.src}")
  |> filter(fn: (r) => r["dst"] == "${options.dst}")
  |> filter(fn: (r) => r["network"] == "${options.network}")
  |> aggregateWindow(every: ${options.aggregateWindow}, fn: last, createEmpty: false)
  |> yield(name: "last")
`;

async function streamCsv(
  req: Request,
  res: Response,
  fluxQuery: string,
  formatRow: (values: string[], tableMeta: FluxTableMetaData) => string,
) {
  let aborted = false;
  const handleAbort = () => {
    aborted = true;
  };

  req.once('aborted', handleAbort);
  res.once('close', () => {
    if (!res.writableEnded) handleAbort();
  });

  res.setHeader('content-type', 'text/csv; charset=utf-8');
  res.flushHeaders();

  const out = new PassThrough({ highWaterMark: 1 * 1024 * 1024 });
  out.pipe(res);

  try {
    for await (const { values, tableMeta } of queryAPI.iterateRows(fluxQuery)) {
      if (aborted) {
        if (!out.writableEnded) out.end();
        return;
      }

      out.write(formatRow(values, tableMeta));
    }
  } catch (err) {
    log.error(err, 'Failed to stream results from InfluxDB');
  } finally {
    if (!out.writableEnded) out.end();
  }
}

queryRouter.post('/', validateMiddleware(rangeOptionsSchema), (req, res) => {
  const options = req.body as z.infer<typeof rangeOptionsSchema>;

  return streamCsv(req, res, sampleFluxQuery(options), (values, tableMeta) => {
    const measurement = tableMeta.get(values, '_measurement');
    const time = tableMeta.get(values, '_time');
    const value = Number(Number(tableMeta.get(values, '_value')).toFixed(5));
    return `${measurement},${time},${value}\n`;
  });
});

queryRouter.post(
  '/errors',
  validateMiddleware(errorOptionsSchema),
  (req, res) => {
    const options = req.body as z.infer<typeof errorOptionsSchema>;

    return streamCsv(req, res, errorFluxQuery(options), (values, tableMeta) => {
      const time = tableMeta.get(values, '_time');
      const reason = tableMeta.get(values, '_value');
      return `${time},${reason}\n`;
    });
  },
);

queryRouter.post(
  '/mtr',
  validateMiddleware(mtrOptionsSchema),
  async (req, res) => {
    const options = req.body as z.infer<typeof mtrOptionsSchema>;

    try {
      let latest: { time: string; hops: string } | null = null;
      for await (const { values, tableMeta } of queryAPI.iterateRows(
        mtrFluxQuery(options),
      )) {
        latest = {
          time: tableMeta.get(values, '_time'),
          hops: tableMeta.get(values, '_value'),
        };
      }

      if (latest == null) return res.status(200).json(null);

      const hops = parseHops(latest.hops);
      return res
        .status(200)
        .json(hops == null ? null : { time: latest.time, hops });
    } catch (err) {
      log.error(err, 'Failed to query MTR from InfluxDB');
      return res.status(500).json({ message: 'mtr query failed' });
    }
  },
);

queryRouter.post('/last', (_req, res) =>
  res.status(200).send(getLastResults()),
);

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1_000;
const CHECK_EVENTS_TTL_MS = 30 * MILLISECONDS_PER_DAY;
const MIN_EVENT_TIME_MS = 1_577_836_800_000;
const MAX_EVENT_TIME_MS = MIN_EVENT_TIME_MS + 100 * 365 * MILLISECONDS_PER_DAY;

const epochMillis = z
  .number()
  .int()
  .min(MIN_EVENT_TIME_MS)
  .max(MAX_EVENT_TIME_MS);

const checksOptionsSchema = z
  .object({
    query: z.string().max(512).default('').transform(parseCheckQuery),
    from: epochMillis.optional(),
    to: epochMillis.optional(),
    cursor: z
      .object({
        time: epochMillis,
        src: nodeSchema,
        dst: replicaRegionsEnum,
        network: z.enum(['private', 'public', 'proxied']),
      })
      .strict()
      .optional(),
    limit: z.number().int().min(1).max(200).default(100),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.from != null && value.to != null) {
      if (value.from > value.to)
        ctx.addIssue({
          code: 'custom',
          path: ['from'],
          message: 'from must be <= to',
        });
      else if (value.to - value.from > CHECK_EVENTS_TTL_MS)
        ctx.addIssue({
          code: 'custom',
          path: ['to'],
          message: 'range may not exceed 30 days',
        });
    }
    if (checkQueryScansBody(value.query) && value.from == null)
      ctx.addIssue({
        code: 'custom',
        path: ['query'],
        message: 'from is required when text or hasBody filter is set',
      });
  });

const checkDetailSchema = z
  .object({
    time: z.number().int(),
    src: nodeSchema,
    dst: replicaRegionsEnum,
    network: z.enum(['private', 'public', 'proxied']),
  })
  .strict();

queryRouter.post(
  '/checks',
  validateMiddleware(checksOptionsSchema),
  async (req, res) => {
    const options = req.body as z.infer<typeof checksOptionsSchema>;

    try {
      const rows = await queryCheckEvents(checkEventClient, {
        ...options,
        limit: options.limit + 1,
      });
      const hasMore = rows.length > options.limit;
      const page = hasMore ? rows.slice(0, options.limit) : rows;
      const lastRow = page[page.length - 1];
      const cursor =
        hasMore && lastRow
          ? {
              time: lastRow.time,
              src: lastRow.src,
              dst: lastRow.dst,
              network: lastRow.network,
            }
          : null;
      return res.status(200).json({ rows: page, cursor });
    } catch (err) {
      log.error(err, 'Failed to query check events from ClickHouse');
      return res.status(500).json({ message: 'check query failed' });
    }
  },
);

queryRouter.post(
  '/checks/detail',
  validateMiddleware(checkDetailSchema),
  async (req, res) => {
    const key = req.body as z.infer<typeof checkDetailSchema>;

    try {
      const detail = await getCheckEventDetail(checkEventClient, key);
      return res.status(200).json(detail);
    } catch (err) {
      log.error(err, 'Failed to query check detail from ClickHouse');
      return res.status(500).json({ message: 'check detail query failed' });
    }
  },
);

const probePopsSchema = z
  .object({
    src: nodeSchema,
    network: z.enum(['public', 'proxied']),
    sinceMs: epochMillis,
  })
  .strict();

queryRouter.post(
  '/probe-pops',
  validateMiddleware(probePopsSchema),
  async (req, res) => {
    const options = req.body as z.infer<typeof probePopsSchema>;

    try {
      const routes = await queryProbeRecentPops(checkEventClient, options);
      return res.status(200).json({ routes });
    } catch (err) {
      log.error(err, 'Failed to query probe pops from ClickHouse');
      return res.status(500).json({ message: 'probe pops query failed' });
    }
  },
);

export default queryRouter;
