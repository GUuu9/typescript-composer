export interface GoogleAuthConfig { clientId: string; clientSecret: string; redirectUri: string; identityKey: string }

export function readGoogleAuthConfig(): GoogleAuthConfig | null {
  const values = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'GOOGLE_IDENTITY_KEY'].map(key => process.env[key]?.trim() ?? '');
  if (values.every(value => !value)) return null;
  const [clientId, clientSecret, redirectUri, identityKey] = values as [string, string, string, string];
  if (!clientId.endsWith('.apps.googleusercontent.com') || !clientSecret || !/^[A-Za-z0-9_-]{43,128}$/.test(identityKey)) throw new Error('Google 인증 환경 설정을 확인하세요.');
  let uri: URL;
  try { uri = new URL(redirectUri); } catch { throw new Error('GOOGLE_REDIRECT_URI 형식을 확인하세요.'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(uri.hostname);
  if (uri.username || uri.password || uri.search || uri.hash || uri.pathname !== '/api/auth/google/callback' || (uri.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && local && uri.protocol === 'http:'))) throw new Error('GOOGLE_REDIRECT_URI는 HTTPS callback 주소여야 합니다.');
  return { clientId, clientSecret, redirectUri, identityKey };
}
