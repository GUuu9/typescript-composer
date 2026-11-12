export interface Api {
  get(path: string, signal?: AbortSignal): Promise<unknown>;
}

export function normalizeApiBase(value: string): string {
  if (!value) return '';
  if (/[\x00-\x20\x7f\\]/.test(value) || value.startsWith('//')) throw new Error('PUBLIC_API_BASE_URL 형식이 잘못되었습니다.');
  let url: URL;
  try { url = new URL(value, 'http://local.invalid'); } catch (cause) { throw new Error('PUBLIC_API_BASE_URL 형식이 잘못되었습니다.', { cause }); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || (!value.startsWith('/') && !/^https?:\/\//.test(value))) throw new Error('PUBLIC_API_BASE_URL은 공개 HTTP(S) 주소 또는 앱 경로여야 합니다.');
  return value === '/' ? '/' : value.replace(/\/$/, '');
}
