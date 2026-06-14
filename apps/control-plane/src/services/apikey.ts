import { createHash, randomBytes } from 'node:crypto';

export function sha256(input: string): Buffer {
  return createHash('sha256').update(input).digest();
}

export function mintApiKey(probeId: string) {
  const random = randomBytes(16).toString('hex');
  const token = `rl_${probeId}_${random}`;
  const hash = sha256(token);
  const prefix = `rl_${probeId}_${random.slice(0, 8)}`;
  return { token, hash, prefix };
}

export function mintEnrollmentToken() {
  const token = `et_${randomBytes(24).toString('base64url')}`;
  return { token, hash: sha256(token) };
}
