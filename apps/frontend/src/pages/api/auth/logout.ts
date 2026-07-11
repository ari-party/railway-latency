import { SESSION_COOKIE_NAME, serializeCookie } from '@/server/auth/session';

import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Set-Cookie', serializeCookie(SESSION_COOKIE_NAME, '', 0));
  res.redirect('/');
}
