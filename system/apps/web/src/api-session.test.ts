import { describe, expect, it } from 'vitest';
import { isSessionExpiry, sessionExpiryMessage } from './api-session';
describe('expired-session handling',()=>{
  it('ends an authenticated workspace on 401 without mistaking bad login or logout for expiry',()=>{
    expect(isSessionExpiry('/api/workflows/test/backtest/runs',401)).toBe(true);
    expect(isSessionExpiry('/api/auth/me',401)).toBe(true);
    expect(isSessionExpiry('/api/auth/login',401)).toBe(false);
    expect(isSessionExpiry('/api/auth/logout',401)).toBe(false);
    expect(isSessionExpiry('/api/workflows/test/backtest/runs',422)).toBe(false);
  });
  it('gives an explicit re-login message without instructing a database reset',()=>{
    expect(sessionExpiryMessage('zh-CN')).toContain('无需重置');expect(sessionExpiryMessage('en')).toContain('sign in again');
  });
});
