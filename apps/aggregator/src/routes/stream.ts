import { Router } from 'express';
import { clearIntervalAsync, setIntervalAsync } from 'set-interval-async';

import { env } from '@/env';
import { SSE } from '@/lib/sse';
import { log } from '@/pino';
import { queryAPI } from '@/services/influxdb';

const POLL_INTERVAL = 2_000;

const streamRouter = Router();
const sse = new SSE();

const streamFluxQueryBuilder = (rangeOptions: {
  rangeStart: string;
  rangeStop: string;
}) => `from(bucket: "${env.INFLUXDB_BUCKET}")
  |> range(start: ${rangeOptions.rangeStart}, stop: ${rangeOptions.rangeStop})
  |> filter(fn: (r) => r["_measurement"] == "http" or r["_measurement"] == "dns")
  |> filter(fn: (r) => r["_field"] == "ms")
  |> aggregateWindow(every: 1s, fn: mean, createEmpty: false)
  |> yield(name: "mean")
`;

let lastSeen = new Date(Date.now() - POLL_INTERVAL).toISOString();
const interval = setIntervalAsync(async () => {
  const queryStopTime = new Date().toISOString();
  const fluxQuery = streamFluxQueryBuilder({
    rangeStart: lastSeen,
    rangeStop: queryStopTime,
  });
  let maxTime = new Date(lastSeen);

  try {
    for await (const { values } of queryAPI.iterateRows(fluxQuery)) {
      const [
        _result,
        _table,
        _start,
        _stop,
        time,
        value,
        _field,
        measurement,
        dst,
        src,
      ] = values;

      const timeDate = new Date(time);
      if (timeDate > maxTime) maxTime = timeDate;

      sse.send(
        `${measurement},${time},${Number(Number(value).toFixed(5))}`,
        `${src}:${dst}`,
      );
    }

    lastSeen =
      maxTime > new Date(lastSeen) ? maxTime.toISOString() : queryStopTime;
  } catch (err) {
    log.error(err, 'Failed to stream results from InfluxDB');
  }
}, POLL_INTERVAL);

const signals = ['SIGINT', 'SIGTERM'];
for (const signal of signals)
  process.on(signal, () => clearIntervalAsync(interval));

streamRouter.get('/events', sse.init);

export default streamRouter;
