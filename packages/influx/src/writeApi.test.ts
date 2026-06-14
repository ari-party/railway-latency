import { InfluxDB } from '@influxdata/influxdb-client';
import { describe, expect, it, vi } from 'vitest';

import { createWriteApi } from '@/writeApi';

describe('createWriteApi', () => {
  it('opens a write API on the org+bucket pinned to ms precision', () => {
    const sentinel = { writePoints: vi.fn(), close: vi.fn() };
    const getWriteApi = vi
      .spyOn(InfluxDB.prototype, 'getWriteApi')
      .mockReturnValue(sentinel as never);

    const writeApi = createWriteApi({
      url: 'http://influx.local:8086',
      token: 'write-only-token',
      org: 'railway',
      bucket: 'latency',
    });

    expect(getWriteApi).toHaveBeenCalledWith(
      'railway',
      'latency',
      'ms',
      undefined,
    );
    expect(writeApi).toBe(sentinel);

    getWriteApi.mockRestore();
  });

  it('forwards write options to the underlying write API', () => {
    const sentinel = { writePoints: vi.fn(), close: vi.fn() };
    const getWriteApi = vi
      .spyOn(InfluxDB.prototype, 'getWriteApi')
      .mockReturnValue(sentinel as never);
    const writeFailed = vi.fn();

    createWriteApi({
      url: 'http://influx.local:8086',
      token: 'write-only-token',
      org: 'railway',
      bucket: 'latency',
      writeOptions: { writeFailed },
    });

    expect(getWriteApi).toHaveBeenCalledWith('railway', 'latency', 'ms', {
      writeFailed,
    });

    getWriteApi.mockRestore();
  });
});
