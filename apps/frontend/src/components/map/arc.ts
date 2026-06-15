export interface Coordinate {
  lat: number;
  lon: number;
}

function wrapLongitude(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

export function arcCurve(
  from: Coordinate,
  to: Coordinate,
  segments = 64,
): [number, number][] {
  if (from.lat === to.lat && from.lon === to.lon) return [[from.lon, from.lat]];

  let deltaLon = to.lon - from.lon;
  if (deltaLon > 180) deltaLon -= 360;
  if (deltaLon < -180) deltaLon += 360;
  const endLon = from.lon + deltaLon;

  const chordX = endLon - from.lon;
  const chordY = to.lat - from.lat;
  const chordLength = Math.hypot(chordX, chordY) || 1;
  const bow = Math.min(chordLength * 0.15, 25);

  const midLat = (from.lat + to.lat) / 2;
  const controlLon = (from.lon + endLon) / 2;
  const controlLat = midLat + (midLat >= 0 ? 1 : -1) * bow;

  const points: [number, number][] = [];
  for (let step = 0; step <= segments; step += 1) {
    const t = step / segments;
    const inverse = 1 - t;
    const lon =
      inverse * inverse * from.lon +
      2 * inverse * t * controlLon +
      t * t * endLon;
    const lat =
      inverse * inverse * from.lat +
      2 * inverse * t * controlLat +
      t * t * to.lat;
    points.push([wrapLongitude(lon), lat]);
  }
  return points;
}

export function splitAtAntimeridian(
  points: [number, number][],
): [number, number][][] {
  if (points.length < 2) return points.length ? [points] : [];

  const segments: [number, number][][] = [];
  let current: [number, number][] = [points[0]];

  for (let index = 1; index < points.length; index += 1) {
    const [previousLon, previousLat] = points[index - 1];
    const [lon, lat] = points[index];

    if (Math.abs(lon - previousLon) > 180) {
      const goingEast = previousLon > 0;
      const edgeBefore = goingEast ? 180 : -180;
      const edgeAfter = goingEast ? -180 : 180;
      const unwrappedLon = goingEast ? lon + 360 : lon - 360;
      const fraction =
        (edgeBefore - previousLon) / (unwrappedLon - previousLon);
      const edgeLat = previousLat + fraction * (lat - previousLat);

      current.push([edgeBefore, edgeLat]);
      segments.push(current);
      current = [[edgeAfter, edgeLat]];
    }

    current.push([lon, lat]);
  }

  segments.push(current);
  return segments;
}

export function latencyColor(milliseconds: number): string {
  if (milliseconds < 20) return '#16a34a';
  if (milliseconds < 50) return '#22c55e';
  if (milliseconds < 100) return '#84cc16';
  if (milliseconds < 150) return '#eab308';
  if (milliseconds < 250) return '#f59e0b';
  return '#ef4444';
}
