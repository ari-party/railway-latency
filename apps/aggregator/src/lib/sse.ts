// Credits to https://github.com/dpskvn/express-sse

import { EventEmitter } from 'node:events';

import type { Request, Response } from 'express';

interface Data {
  event?: string;
  data: unknown;
}

export class SSE extends EventEmitter {
  constructor(private readonly heartbeatInterval: number = 30) {
    super();

    this.init = this.init.bind(this);
  }

  init(req: Request, res: Response) {
    let id = 0;

    req.socket.setTimeout(0);
    req.socket.setNoDelay(true);
    req.socket.setKeepAlive(true);

    res.status(200);
    res.setHeader('content-type', 'text/event-stream');
    res.setHeader('cache-control', 'no-cache');
    res.setHeader('x-accel-buffering', 'no');
    if (req.httpVersionMajor < 2) res.setHeader('Connection', 'keep-alive');

    this.setMaxListeners(this.getMaxListeners() + 2);

    const dataListener = (data: Data) => {
      res.write(`id: ${id}\n`);
      id += 1;

      if (data.event) res.write(`event: ${data.event}\n`);

      res.write(`data: ${JSON.stringify(data.data)}\n\n`);

      res.flushHeaders();
    };
    this.on('data', dataListener);

    const heartbeatInterval = setInterval(() => {
      res.write(': heartbeat\n\n');

      res.flushHeaders();
    }, this.heartbeatInterval * 1_000);

    req.on('close', () => {
      this.removeListener('data', dataListener);
      clearInterval(heartbeatInterval);

      this.setMaxListeners(this.getMaxListeners() - 2);
    });
  }

  send(data: Data['data'], event: Data['event']) {
    this.emit('data', { data, event });
  }
}
