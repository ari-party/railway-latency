import { Router } from 'express';
import { clearIntervalAsync, setIntervalAsync } from 'set-interval-async';

import { env } from '@/env';
import { SSE } from '@/lib/sse';
import { log } from '@/pino';
import { queryAPI } from '@/services/influxdb';

const POLL_INTERVAL = 5_000;

const streamRouter = Router();
const sse = new SSE(5);

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
  const queryStopTime = new Date();
  const queryStopTimeISO = queryStopTime.toISOString();

  // Ensure we have a minimum time range to avoid tiny queries
  const lastSeenDate = new Date(lastSeen);
  const timeDiff = queryStopTime.getTime() - lastSeenDate.getTime();

  // If the time range is too small (< 1 second), skip this poll
  if (timeDiff < 1000) {
    log.debug(
      { timeDiff, lastSeen, queryStopTime: queryStopTimeISO },
      'Skipping poll - time range too small',
    );
    return;
  }

  const fluxQuery = streamFluxQueryBuilder({
    rangeStart: lastSeen,
    rangeStop: queryStopTimeISO,
  });
  let maxTime = new Date(lastSeen);

  log.debug(
    { fluxQuery, lastSeen, queryStopTime: queryStopTimeISO },
    'Polling InfluxDB',
  );

  let rows = 0;
  try {
    for await (const { values } of queryAPI.iterateRows(fluxQuery)) {
      rows += 1;

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

    // Update lastSeen: if we got data, use maxTime; otherwise, use queryStopTime minus a small buffer
    // to avoid missing data at the boundary while preventing tiny ranges
    if (rows > 0 && maxTime > new Date(lastSeen)) {
      lastSeen = maxTime.toISOString();
    } else {
      // No data found: advance by most of the interval but leave a small buffer
      // This prevents tiny ranges while ensuring we don't miss data
      const bufferMs = 500; // 500ms buffer
      const newLastSeen = new Date(queryStopTime.getTime() - bufferMs);
      lastSeen = newLastSeen.toISOString();
    }

    log.debug({ rows, lastSeen, timeRange: timeDiff }, 'Poll completed');
  } catch (err) {
    log.error(err, 'Failed to stream results from InfluxDB');
    // On error, don't advance lastSeen to avoid missing data
  }
}, POLL_INTERVAL);

const signals = ['SIGINT', 'SIGTERM'];
for (const signal of signals)
  process.on(signal, () => clearIntervalAsync(interval));

streamRouter.get('/events', sse.init);

export default streamRouter;
