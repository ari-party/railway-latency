export type ProbeMeasurement = Record<'http' | 'dns', number | null>;

export type ProbeResults = Record<string, ProbeMeasurement>;

export type ProbeResultsDictionary = Record<string, ProbeResults>;

export interface Probe {
  time: number;
  results: ProbeResults;
}
