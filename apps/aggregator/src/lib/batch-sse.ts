// Credits to https://github.com/dpskvn/express-sse

import { EventEmitter } from 'node:events';

import type { Request, Response } from 'express';

interface Data {
  event?: string;
  data: unknown;
}

export type Batch = Array<[data: Data['data'], event: Data['event']]>;

export class BatchSSE extends EventEmitter<{
  batch: [Batch];
}> {
  constructor(private readonly heartbeatInterval: number = 30) {
    super();

    this.init = this.init.bind(this);
  }

  init(req: Request, res: Response) {
    req.socket.setTimeout(0);
    req.socket.setNoDelay(true);
    req.socket.setKeepAlive(true);

    res.status(200);
    res.setHeader('content-type', 'text/event-stream');
    res.setHeader('cache-control', 'no-cache');
    res.setHeader('x-accel-buffering', 'no');
    if (req.httpVersionMajor < 2) res.setHeader('Connection', 'keep-alive');

    res.write(': connected\n\n');
    res.flush();

    this.setMaxListeners(this.getMaxListeners() + 2);

    const batchListener = (batch: Parameters<this['batch']>[0]) => {
      for (const [data, event] of batch) {
        if (event) res.write(`event: ${event}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      }

      res.flush();
    };
    this.on('batch', batchListener);

    const heartbeatInterval = setInterval(() => {
      res.write(': heartbeat\n\n');
      res.flush();
    }, this.heartbeatInterval * 1_000);

    req.on('close', () => {
      this.removeListener('batch', batchListener);
      clearInterval(heartbeatInterval);

      this.setMaxListeners(this.getMaxListeners() - 2);
    });
  }

  batch(batch: Batch) {
    if (batch.length === 0) return;
    this.emit('batch', batch);
  }
}
