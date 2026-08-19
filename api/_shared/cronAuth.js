import { timingSafeEqual } from 'node:crypto';

const clean = (value) => String(value || '').trim().replace(/[\r\n]/g, '');

export const isAuthorizedCronRequest = (req) => {
  const expected = clean(process.env.CRON_SECRET);
  const authorization = Array.isArray(req.headers.authorization)
    ? req.headers.authorization[0]
    : req.headers.authorization;
  const actual = clean(authorization).match(/^Bearer\s+(.+)$/i)?.[1] || '';
  if (!expected || !actual) return false;
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length
    && timingSafeEqual(expectedBuffer, actualBuffer);
};
