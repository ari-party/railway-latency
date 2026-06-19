export function toClickHouseDateTime(unixMilliseconds: number): string {
  return new Date(unixMilliseconds)
    .toISOString()
    .replace('T', ' ')
    .replace('Z', '');
}
