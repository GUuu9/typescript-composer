import { createHash, createHmac, createPublicKey, verify, type JsonWebKey } from 'node:crypto';
import type { GoogleAuthConfig } from '../../config/googleAuth.config.ts';

const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));

export class GoogleAuthService {
  private readonly config: GoogleAuthConfig;
  private readonly fetcher: typeof fetch;
  private keys: Record<string, unknown>[] = [];
  private keysExpire = 0;
  private keyRequest: Promise<void> | undefined;
  constructor(config: GoogleAuthConfig, fetcher: typeof fetch = fetch) { this.config = config; this.fetcher = fetcher; }

  authorizationUrl(state: string, nonce: string, verifier: string): string {
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({ client_id: this.config.clientId, redirect_uri: this.config.redirectUri,
      response_type: 'code', scope: 'openid', state, nonce, prompt: 'select_account',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }).toString();
    return url.href;
  }

  private async json(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
    const response = await this.fetcher(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!response.ok || !response.body) throw new Error('Google 인증 요청에 실패했습니다.');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) {
        const next = await reader.read(); if (next.done) break;
        size += next.value.length;
        if (size > 65536) { await reader.cancel(); throw new Error('Google 응답 크기를 초과했습니다.'); }
        chunks.push(next.value);
      }
    } finally { reader.releaseLock(); }
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!record(value)) throw new Error('Google 응답 형식을 확인할 수 없습니다.');
    return value;
  }

  private async signingKeys(): Promise<void> {
    if (Date.now() < this.keysExpire) return;
    this.keyRequest ??= (async () => {
      const data = await this.json('https://www.googleapis.com/oauth2/v3/certs');
      if (!Array.isArray(data.keys) || data.keys.length < 1 || data.keys.length > 20 || !data.keys.every(record)) throw new Error('Google 서명 키가 올바르지 않습니다.');
      this.keys = data.keys;
      this.keysExpire = Date.now() + 5 * 60 * 1000;
    })();
    try { await this.keyRequest; } finally { this.keyRequest = undefined; }
  }

  async exchange(code: string, verifier: string, nonce: string): Promise<string> {
    const data = await this.json('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, code_verifier: verifier, client_id: this.config.clientId, client_secret: this.config.clientSecret, redirect_uri: this.config.redirectUri, grant_type: 'authorization_code' }) });
    if (typeof data.id_token !== 'string' || data.id_token.length > 16384 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(data.id_token)) throw new Error('Google 인증 토큰이 올바르지 않습니다.');
    const [head, body, signature] = data.id_token.split('.') as [string, string, string];
    const header: unknown = JSON.parse(Buffer.from(head, 'base64url').toString());
    const claims: unknown = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!record(header) || header.alg !== 'RS256' || typeof header.kid !== 'string' || !record(claims)) throw new Error('Google 인증 토큰이 올바르지 않습니다.');
    await this.signingKeys();
    const key = this.keys.find(key => key.kid === header.kid && key.kty === 'RSA' && key.alg === 'RS256' && key.use === 'sig');
    if (!key || !verify('RSA-SHA256', Buffer.from(`${head}.${body}`), createPublicKey({ key: key as JsonWebKey, format: 'jwk' }), Buffer.from(signature, 'base64url'))) throw new Error('Google 서명을 확인할 수 없습니다.');
    const now = Math.floor(Date.now() / 1000);
    if ((claims.iss !== 'accounts.google.com' && claims.iss !== 'https://accounts.google.com') || claims.aud !== this.config.clientId ||
      (claims.azp !== undefined && claims.azp !== this.config.clientId) || !Number.isSafeInteger(claims.exp) || Number(claims.exp) <= now ||
      !Number.isSafeInteger(claims.iat) || Number(claims.iat) > now + 60 || claims.nonce !== nonce || typeof claims.sub !== 'string' || !/^[A-Za-z0-9_-]{1,255}$/.test(claims.sub)) throw new Error('Google 인증 정보를 확인할 수 없습니다.');
    // 원문 sub·토큰·프로필은 저장하거나 반환하지 않는다.
    return createHmac('sha256', this.config.identityKey).update(`google:${claims.sub}`).digest('hex');
  }
}

export function createGoogleAuthService(config: GoogleAuthConfig): GoogleAuthService {
  return new GoogleAuthService(config);
}
