import { Router } from 'express';
import { setIntervalAsync } from 'set-interval-async';

import { env } from '@/env';
import { SSE } from '@/lib/sse';
import { log } from '@/pino';
import { queryAPI } from '@/services/influxdb';

const POLL_INTERVAL = 2_000;

const streamRouter = Router();
const sse = new SSE(15);

const streamFluxQueryBuilder = (rangeOptions: {
  rangeStart: string;
}) => `from(bucket: "${env.INFLUXDB_BUCKET}")
  |> range(start: ${rangeOptions.rangeStart}, stop: ${new Date().toISOString()})
  |> filter(fn: (r) => r["_measurement"] == "http" or r["_measurement"] == "dns")
  |> filter(fn: (r) => r["_field"] == "ms")
  |> aggregateWindow(every: 1s, fn: mean, createEmpty: false)
  |> yield(name: "mean")
`;

let lastSeen = new Date(Date.now() - POLL_INTERVAL).toISOString();
setIntervalAsync(async () => {
  const fluxQuery = streamFluxQueryBuilder({ rangeStart: lastSeen });
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

    if (maxTime > new Date(lastSeen)) lastSeen = maxTime.toISOString();
  } catch (err) {
    log.error(err, 'Failed to stream results from InfluxDB');
  }
}, POLL_INTERVAL);

streamRouter.get('/', sse.init);

export default streamRouter;
