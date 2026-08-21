import type { CookieOptions } from 'express';

export function refreshCookieOptions(expiresAt?: Date): CookieOptions {
  const options: CookieOptions = {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/auth',
  };

  return expiresAt ? { ...options, expires: expiresAt } : options;
}
