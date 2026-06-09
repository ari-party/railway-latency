import { Router } from 'express';
import z from 'zod';

import { env } from '@/env';
import { log } from '@/pino';
import { queryAPI } from '@/services/influxdb';

const alertsRouter = Router();

const ROUTING_MEASUREMENTS = ['httpPublicHikari', 'httpProxiedHikari'] as const;

const LATENCY_MEASUREMENTS = ['http', ...ROUTING_MEASUREMENTS] as const;

const ROUTING_FIELDS = ['railway_edge', 'cf_pop', 'hikari_pop'] as const;

// Interpolated into Flux text, so constrain to a bare duration literal.
const fluxDuration = z.string().regex(/^\d+(ns|us|ms|s|m|h|d|w)$/);

const snapshotQuerySchema = z
  .object({
    window: fluxDuration.default('15s'),
    lookback: fluxDuration.default('1h'),
  })
  .strict();

function measurementFilter(measurements: readonly string[]): string {
  return measurements
    .map((measurement) => `r._measurement == "${measurement}"`)
    .join(' or ');
}

function latencyFlux(window: string): string {
  return `from(bucket: "${env.INFLUXDB_BUCKET}")
  |> range(start: -${window})
  |> filter(fn: (r) => ${measurementFilter(LATENCY_MEASUREMENTS)})
  |> filter(fn: (r) => r._field == "ms")
  |> group(columns: ["src", "dst", "_measurement"])
  |> median()
  |> rename(columns: { _measurement: "measurement", _value: "median" })
  |> keep(columns: ["src", "dst", "measurement", "median"])
`;
}

function routingFlux(lookback: string): string {
  return `from(bucket: "${env.INFLUXDB_BUCKET}")
  |> range(start: -${lookback})
  |> filter(fn: (r) => ${measurementFilter(ROUTING_MEASUREMENTS)})
  |> filter(fn: (r) => ${ROUTING_FIELDS.map((field) => `r._field == "${field}"`).join(' or ')})
  |> group(columns: ["src", "dst", "_measurement", "_field", "_value"])
  |> sort(columns: ["_time"])
  |> reduce(
    identity: { count: 0, firstTime: 0, lastTime: 0 },
    fn: (r, accumulator) => ({
      count: accumulator.count + 1,
      firstTime: if accumulator.count == 0 then int(v: r._time) / 1000000 else accumulator.firstTime,
      lastTime: int(v: r._time) / 1000000,
    })
  )
  |> rename(columns: { _measurement: "measurement", _field: "field", _value: "value" })
  |> keep(columns: ["src", "dst", "measurement", "field", "value", "count", "firstTime", "lastTime"])
`;
}

interface LatencyRow {
  src: string;
  dst: string;
  measurement: string;
  median: number;
}

interface RoutingRow {
  src: string;
  dst: string;
  measurement: string;
  field: string;
  value: string;
  count: number;
  firstTime: number;
  lastTime: number;
}

alertsRouter.get('/snapshot', async (req, res) => {
  const parsed = snapshotQuerySchema.safeParse(req.query);
  if (!parsed.success)
    return res.status(400).json({
      success: false,
      message: 'Failed to parse request',
      data: parsed.error,
    });
  const { lookback, window } = parsed.data;

  try {
    const [latencyRows, routingRows] = await Promise.all([
      queryAPI.collectRows<LatencyRow>(latencyFlux(window)),
      queryAPI.collectRows<RoutingRow>(routingFlux(lookback)),
    ]);

    const latency = latencyRows.map((row) => ({
      src: row.src,
      dst: row.dst,
      measurement: row.measurement,
      median: Number(Number(row.median).toFixed(5)),
    }));

    const routing = routingRows.map((row) => ({
      src: row.src,
      dst: row.dst,
      measurement: row.measurement,
      field: row.field,
      value: row.value,
      count: Number(row.count),
      firstTime: new Date(Number(row.firstTime)).toISOString(),
      lastTime: new Date(Number(row.lastTime)).toISOString(),
    }));

    return res.status(200).json({ latency, routing });
  } catch (err) {
    log.error(err, 'Failed to build alert snapshot');
    return res.status(500).json({ latency: [], routing: [] });
  }
});

export default alertsRouter;
