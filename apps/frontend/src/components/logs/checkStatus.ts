export const STATUS_TONE_COLOR = {
  ok: 'status.green',
  error: 'status.down',
} as const;

export const STATUS_TONE_BG = {
  ok: 'hsl(146, 64%, 50%, 0.13)',
  error: 'hsl(2, 82%, 63%, 0.15)',
} as const;

export interface CheckStatusInput {
  failStage: string;
  httpStatus: number | null;
}

export interface CheckStatusLabel {
  text: string;
  tone: 'ok' | 'error';
}

export function checkStatusLabel(row: CheckStatusInput): CheckStatusLabel {
  if (row.failStage)
    return { text: row.failStage.toUpperCase(), tone: 'error' };
  if (row.httpStatus == null) return { text: '·', tone: 'error' };
  const ok = row.httpStatus >= 200 && row.httpStatus < 300;
  return { text: String(row.httpStatus), tone: ok ? 'ok' : 'error' };
}
