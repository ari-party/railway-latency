import crypto from 'node:crypto';

export function shaHash(input: string) {
  return crypto.createHash('sha256').update(input).digest('hex');
}
