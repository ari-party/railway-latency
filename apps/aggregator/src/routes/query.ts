import { Router } from 'express';
import z from 'zod';

import { getLastResults } from '@/aggregator';
import { env } from '@/env';
import { validateMiddleware } from '@/middleware/validate';
import { log } from '@/pino';
import { queryAPI } from '@/services/influxdb';

const queryRouter = Router();

const regionEnum = z.enum(env.RAILWAY_REPLICA_REGIONS);

const rangeOptionsSchema = z
  .object({
    src: regionEnum,
    dst: regionEnum,
    rangeStart: z.iso.datetime(),
    rangeEnd: z.iso.datetime(),
    measurements: z
      .array(z.union([z.literal('http'), z.literal('dns')]))
      .min(1),
    aggregateWindow: z.string(),
  })
  .strict();

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

    try {
      let logged = false;

      for await (const { values } of queryAPI.iterateRows(fluxQuery)) {
        if (aborted) return;

        if (!logged) {
          console.log(values);
          logged = true;
        }

        res.write(`${values.join('\n')}\n`);
      }

      res.status(200).end();
    } catch (error) {
      log.error(
        { err: error, fluxQuery },
        'Failed to stream results from InfluxDB',
      );

      if (!aborted)
        res.status(500).json({
          success: false,
          message: 'Failed to query range results',
        });
    }
  },
);

queryRouter.post('/last', (_req, res) =>
  res.status(200).send(getLastResults()),
);

export default queryRouter;
