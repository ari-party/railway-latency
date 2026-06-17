import { describe, expect, it } from 'vitest';

import { checkStatusLabel } from '@/components/logs/checkStatus';

describe('checkStatusLabel', () => {
  it('shows a 2xx status with an ok tone', () => {
    expect(checkStatusLabel({ failStage: '', httpStatus: 200 })).toEqual({
      text: '200',
      tone: 'ok',
    });
  });

  it('shows a non-2xx status with an error tone', () => {
    expect(checkStatusLabel({ failStage: '', httpStatus: 503 })).toEqual({
      text: '503',
      tone: 'error',
    });
  });

  it('shows the fail stage when the check never reached HTTP', () => {
    expect(checkStatusLabel({ failStage: 'dns', httpStatus: null })).toEqual({
      text: 'DNS',
      tone: 'error',
    });
  });

  it('shows a placeholder with an error tone when there is no fail stage and no http status', () => {
    expect(checkStatusLabel({ failStage: '', httpStatus: null })).toEqual({
      text: '·',
      tone: 'error',
    });
  });
});
