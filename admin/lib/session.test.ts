import { describe, expect, it } from 'vitest';
import { jwtPayload } from './gotrue';
import { devAdmin, isAdminUser } from './session';

const jwt = (p: object) => `x.${Buffer.from(JSON.stringify(p)).toString('base64url')}.y`;

describe('admin prihlásenie', () => {
  it('iba app_metadata.role = admin', () => {
    expect(isAdminUser({ app_metadata: { role: 'admin' } })).toBe(true);
    expect(isAdminUser({ app_metadata: { role: 'customer' } })).toBe(false);
    expect(isAdminUser({ app_metadata: {} })).toBe(false);
    expect(isAdminUser(null)).toBe(false);
  });
  it('aal a exp z tokenu', () => {
    expect(jwtPayload(jwt({ aal: 'aal2', exp: 123 }))).toMatchObject({ aal: 'aal2', exp: 123 });
    expect(jwtPayload('nezmysel')).toEqual({});
  });
  it('obídenie prihlásenia iba v next dev', () => {
    expect(devAdmin({ NODE_ENV: 'production', ADMIN_DEV_USER: 'a@b.sk' })).toBeNull();
    expect(devAdmin({ NODE_ENV: 'test', ADMIN_DEV_USER: 'a@b.sk' })).toBeNull();
    expect(devAdmin({ NODE_ENV: 'development' })).toBeNull();
    expect(devAdmin({ NODE_ENV: 'development', ADMIN_DEV_USER: 'a@b.sk' })?.email).toContain('a@b.sk');
  });
});
