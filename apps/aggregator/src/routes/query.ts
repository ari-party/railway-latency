import { PassThrough } from 'node:stream';

import { getRangeOptionsSchema } from '@railway-latency/utils';
import { Router } from 'express';

import { getLastResults } from '@/aggregator';
import { env } from '@/env';
import { validateMiddleware } from '@/middleware/validate';
import { log } from '@/pino';
import { queryAPI } from '@/services/influxdb';

import type z from 'zod';

const queryRouter = Router();

const rangeOptionsSchema = getRangeOptionsSchema(env.RAILWAY_REPLICA_REGIONS);

const rangeFluxQueryBuilder = (
  rangeOptions: z.infer<typeof rangeOptionsSchema>,
) => `from(bucket: "${env.INFLUXDB_BUCKET}")
  |> range(start: ${rangeOptions.rangeStart}, stop: ${rangeOptions.rangeEnd})
  |> filter(fn: (r) => ${rangeOptions.measurements.map((measurement) => `r["_measurement"] == "${measurement}"`).join(' or ')})
  |> filter(fn: (r) => r["_field"] == "ms")
  |> filter(fn: (r) => r["src"] == "${rangeOptions.src}")
  |> filter(fn: (r) => r["dst"] == "${rangeOptions.dst}")
  |> aggregateWindow(every: ${rangeOptions.aggregateWindow}, fn: mean, createEmpty: false)
  |> yield(name: "mean")
`;

queryRouter.post(
  '/',
  validateMiddleware(rangeOptionsSchema),
  async (req, res) => {
    const rangeOptions = req.body as z.infer<typeof rangeOptionsSchema>;
    const fluxQuery = rangeFluxQueryBuilder(rangeOptions);

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
      for await (const { values } of queryAPI.iterateRows(fluxQuery)) {
        if (aborted) {
          if (!out.writableEnded) out.end();
          return;
        }

        const [
          _result,
          _table,
          _start,
          _stop,
          time,
          value,
          _field,
          measurement,
          _dst,
          _src,
        ] = values;

        // Should match the QueryResultLine type after splitting
        out.write(
          `${measurement},${time},${Number(Number(value).toFixed(5))}\n`,
        );
      }
    } catch (err) {
      log.error(err, 'Failed to stream results from InfluxDB');
    } finally {
      if (!out.writableEnded) out.end();
    }
  },
);

queryRouter.post('/last', (_req, res) =>
  res.status(200).send(getLastResults()),
);

export default queryRouter;
