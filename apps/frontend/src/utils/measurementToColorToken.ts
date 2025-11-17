import type { ProbeMeasurement } from '@railway-latency/types';

export default function measurementToColorToken(
  measurement: keyof ProbeMeasurement,
) {
  switch (measurement) {
    case 'http':
      return 'blue.600';
    case 'dns':
      return 'pink.600';
  }
}
