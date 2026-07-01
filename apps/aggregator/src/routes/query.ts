import {
  checkQueryScansBody,
  getCheckEventDetail,
  parseCheckQuery,
  queryCheckEvents,
  queryErrorAggregates,
  queryFleetMetrics,
  queryLatestMtr,
  queryPopProbeLatency,
  queryProbeRecentPops,
  queryRailwayPops,
  querySampleAggregates,
} from '@railway-latency/clickhouse';
import { getRangeOptionsSchema } from '@railway-latency/utils';
import { Router } from 'express';
import z from 'zod';

import { getLastResults } from '@/aggregator';
import { env } from '@/env';
import { validateMiddleware } from '@/middleware/validate';
import { log } from '@/pino';
import { checkEventClient } from '@/services/clickhouse';
import { parseFluxDurationMs } from '@/services/duration';

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

const metricsOptionsSchema = z
  .object({
    network: z.enum(['private', 'public', 'proxied']),
    rangeStart: z.iso.datetime(),
    rangeEnd: z.iso.datetime(),
    aggregateWindow: z.string(),
  })
  .strict();

const mtrOptionsSchema = z
  .object({
    src: nodeSchema,
    dst: replicaRegionsEnum,
    network: z.enum(['public', 'proxied']),
  })
  .strict();

const popsOptionsSchema = z
  .object({
    sinceMs: z.number().int(),
  })
  .strict();

const popLatencyOptionsSchema = z
  .object({
    pop: z.string().max(32),
    dst: replicaRegionsEnum.nullable(),
    rangeStart: z.iso.datetime(),
    rangeEnd: z.iso.datetime(),
    aggregateWindow: z.string(),
  })
  .strict();

function parseHops(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const MTR_LOOKBACK_MS = 24 * 60 * 60 * 1_000;

queryRouter.post(
  '/',
  validateMiddleware(rangeOptionsSchema),
  async (req, res) => {
    const options = req.body as z.infer<typeof rangeOptionsSchema>;

    try {
      const rows = await querySampleAggregates(checkEventClient, {
        src: options.src,
        dst: options.dst,
        measurements: options.measurements,
        rangeStartMs: Date.parse(options.rangeStart),
        rangeEndMs: Date.parse(options.rangeEnd),
        windowMs: parseFluxDurationMs(options.aggregateWindow),
      });

      res.setHeader('content-type', 'text/csv; charset=utf-8');
      const body = rows
        .map(
          (row) =>
            `${row.measurement},${new Date(row.bucketMs).toISOString()},${row.value}\n`,
        )
        .join('');
      return res.status(200).send(body);
    } catch (err) {
      log.error(err, 'Failed to query samples from ClickHouse');
      return res.status(500).send('');
    }
  },
);

queryRouter.post(
  '/errors',
  validateMiddleware(errorOptionsSchema),
  async (req, res) => {
    const options = req.body as z.infer<typeof errorOptionsSchema>;

    try {
      const rows = await queryErrorAggregates(checkEventClient, {
        src: options.src,
        dst: options.dst,
        network: options.network,
        rangeStartMs: Date.parse(options.rangeStart),
        rangeEndMs: Date.parse(options.rangeEnd),
        windowMs: parseFluxDurationMs(options.aggregateWindow),
      });

      res.setHeader('content-type', 'text/csv; charset=utf-8');
      const body = rows
        .map((row) => `${new Date(row.bucketMs).toISOString()},${row.reason}\n`)
        .join('');
      return res.status(200).send(body);
    } catch (err) {
      log.error(err, 'Failed to query errors from ClickHouse');
      return res.status(500).send('');
    }
  },
);

queryRouter.post(
  '/metrics',
  validateMiddleware(metricsOptionsSchema),
  async (req, res) => {
    const options = req.body as z.infer<typeof metricsOptionsSchema>;

    try {
      const rows = await queryFleetMetrics(checkEventClient, {
        network: options.network,
        rangeStartMs: Date.parse(options.rangeStart),
        rangeEndMs: Date.parse(options.rangeEnd),
        windowMs: parseFluxDurationMs(options.aggregateWindow),
      });

      return res.status(200).json(rows);
    } catch (err) {
      log.error(err, 'Failed to query fleet metrics from ClickHouse');
      return res.status(500).json({ message: 'metrics query failed' });
    }
  },
);

queryRouter.post(
  '/pops',
  validateMiddleware(popsOptionsSchema),
  async (req, res) => {
    const options = req.body as z.infer<typeof popsOptionsSchema>;

    try {
      const pops = await queryRailwayPops(checkEventClient, options);
      return res.status(200).json(pops);
    } catch (err) {
      log.error(err, 'Failed to query railway pops from ClickHouse');
      return res.status(500).json({ message: 'pops query failed' });
    }
  },
);

queryRouter.post(
  '/pop-latency',
  validateMiddleware(popLatencyOptionsSchema),
  async (req, res) => {
    const options = req.body as z.infer<typeof popLatencyOptionsSchema>;

    try {
      const rows = await queryPopProbeLatency(checkEventClient, {
        pop: options.pop,
        dst: options.dst,
        rangeStartMs: Date.parse(options.rangeStart),
        rangeEndMs: Date.parse(options.rangeEnd),
        windowMs: parseFluxDurationMs(options.aggregateWindow),
      });

      return res.status(200).json(rows);
    } catch (err) {
      log.error(err, 'Failed to query pop latency from ClickHouse');
      return res.status(500).json({ message: 'pop latency query failed' });
    }
  },
);

queryRouter.post(
  '/mtr',
  validateMiddleware(mtrOptionsSchema),
  async (req, res) => {
    const options = req.body as z.infer<typeof mtrOptionsSchema>;

    try {
      const row = await queryLatestMtr(checkEventClient, {
        src: options.src,
        dst: options.dst,
        network: options.network,
        sinceMs: Date.now() - MTR_LOOKBACK_MS,
      });
      if (row == null) return res.status(200).json(null);

      const hops = parseHops(row.hops);
      return res
        .status(200)
        .json(
          hops == null
            ? null
            : { time: new Date(row.timeMs).toISOString(), hops },
        );
    } catch (err) {
      log.error(err, 'Failed to query MTR from ClickHouse');
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
