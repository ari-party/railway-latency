export type Results = Record<string, number | null>;

export interface ProbeResults {
  http: Results;
  dns: Results;
}

export interface Probe extends ProbeResults {
  time: number;
}
