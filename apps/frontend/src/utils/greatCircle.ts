export type LngLat = [number, number];

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

export function greatCircleArc(from: LngLat, to: LngLat, steps = 64): LngLat[] {
  const lon1 = toRadians(from[0]);
  const lat1 = toRadians(from[1]);
  const lon2 = toRadians(to[0]);
  const lat2 = toRadians(to[1]);

  const delta =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((lat2 - lat1) / 2) ** 2 +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2,
      ),
    );

  if (delta === 0) return [from, to];

  const points: LngLat[] = [];
  let previousLon: number | null = null;

  for (let step = 0; step <= steps; step += 1) {
    const fraction = step / steps;
    const a = Math.sin((1 - fraction) * delta) / Math.sin(delta);
    const b = Math.sin(fraction * delta) / Math.sin(delta);

    const x =
      a * Math.cos(lat1) * Math.cos(lon1) + b * Math.cos(lat2) * Math.cos(lon2);
    const y =
      a * Math.cos(lat1) * Math.sin(lon1) + b * Math.cos(lat2) * Math.sin(lon2);
    const z = a * Math.sin(lat1) + b * Math.sin(lat2);

    const latitude = Math.atan2(z, Math.sqrt(x * x + y * y));
    let longitude = toDegrees(Math.atan2(y, x));

    if (previousLon != null) {
      while (longitude - previousLon > 180) longitude -= 360;
      while (longitude - previousLon < -180) longitude += 360;
    }
    previousLon = longitude;

    points.push([longitude, toDegrees(latitude)]);
  }

  return points;
}
