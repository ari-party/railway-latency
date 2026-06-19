// ClickHouse DateTime64 string literal: 'YYYY-MM-DD HH:MM:SS.mmm' (UTC, no zone suffix).
export function toClickHouseDateTime(unixMilliseconds: number): string {
  return new Date(unixMilliseconds)
    .toISOString()
    .replace('T', ' ')
    .replace('Z', '');
}
