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
