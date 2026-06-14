import type { RosterProbe } from '@railway-latency/types';
import type { Request as ExpressRequest } from 'express';

export type { RosterProbe } from '@railway-latency/types';

export type Resolution =
  | { probe: RosterProbe }
  | { unknown: true }
  | { unavailable: true };

export interface AuthenticatedRequest extends ExpressRequest {
  probe: RosterProbe;
}

declare module 'express-serve-static-core' {
  interface Request {
    probe?: RosterProbe;
  }
}
