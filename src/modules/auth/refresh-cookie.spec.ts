import { refreshCookieOptions } from './refresh-cookie';

describe('refreshCookieOptions', () => {
  it('mantiene los atributos de alcance y seguridad al crear y borrar la cookie', () => {
    const expiresAt = new Date('2030-01-01T00:00:00.000Z');
    const createOptions = refreshCookieOptions(expiresAt);
    const clearOptions = refreshCookieOptions();

    expect(createOptions).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/api',
      expires: expiresAt,
    });
    expect(clearOptions).toMatchObject({
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/api',
    });
    expect(clearOptions).not.toHaveProperty('expires');
  });
});
