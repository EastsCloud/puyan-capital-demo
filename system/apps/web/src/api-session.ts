export function isSessionExpiry(path: string, status: number): boolean {
  return status === 401 && !['/api/auth/login', '/api/auth/logout'].includes(path.split('?')[0]);
}
export function sessionExpiryMessage(locale: string): string {
  return locale === 'en' ? 'Your sign-in session expired. Please sign in again. Saved data are unchanged.' : '登录已失效，请重新登录。已保存的数据不会丢失，无需重置流程。';
}
