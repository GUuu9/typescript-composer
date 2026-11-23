import { randomBytes } from 'node:crypto';
import type { GoogleAuthService } from '../../services/googleAuth/googleAuth.service.ts';

const random = () => randomBytes(32).toString('base64url');
type Attempt = { expiresAt: number; origin: string } & ({ state: string; nonce: string; verifier: string } | { subject: string });

export interface GoogleAuthSession {
  userId: string;
  token: string;
  expiresAt: number;
}

export interface GoogleAuthAccounts {
  signIn(identity: string): GoogleAuthSession | null;
  signUp(identity: string, input: unknown): GoogleAuthSession;
}

export class GoogleAuthUsecase {
  private readonly google: Pick<GoogleAuthService, 'authorizationUrl' | 'exchange'> | null;
  private readonly attempts = new Map<string, Attempt>();
  private disposed = false;
  private windowEnd = 0;
  private starts = 0;
  constructor(google: Pick<GoogleAuthService, 'authorizationUrl' | 'exchange'> | null, private readonly accounts: GoogleAuthAccounts) {
    this.google = google;
  }
  private prune(): void {
    if (this.disposed) throw new Error('Google 인증이 종료되었습니다.');
    for (const [key, value] of this.attempts) if (value.expiresAt <= Date.now()) this.attempts.delete(key);
  }
  status(key: string | undefined) {
    this.prune();
    const attempt = key ? this.attempts.get(key) : undefined;
    return { enabled: this.google !== null, needsNickname: Boolean(attempt && 'subject' in attempt) };
  }
  begin(origin: string, previous: string | undefined) {
    this.prune();
    if (!this.google) throw new Error('Google 로그인이 설정되지 않았습니다.');
    if (previous) this.attempts.delete(previous);
    if (this.attempts.size >= 1000) throw new Error('로그인 요청이 많습니다. 잠시 후 다시 시도해주세요.');
    if (Date.now() >= this.windowEnd) { this.windowEnd = Date.now() + 60000; this.starts = 0; }
    if (++this.starts > 60) throw new Error('로그인 요청이 많습니다.');
    const key = random(), state = random(), nonce = random(), verifier = random();
    this.attempts.set(key, { origin, expiresAt: Date.now() + 600000, state, nonce, verifier });
    return { key, url: this.google.authorizationUrl(state, nonce, verifier) };
  }
  async callback(key: string | undefined, state: string, code: string) {
    this.prune();
    const attempt = key ? this.attempts.get(key) : undefined;
    if (!this.google || !key || !attempt || !('state' in attempt) || attempt.state !== state) throw new Error('로그인 요청이 만료되었거나 일치하지 않습니다.');
    this.attempts.delete(key);
    const subject = await this.google.exchange(code, attempt.verifier, attempt.nonce);
    this.prune();
    if (attempt.expiresAt <= Date.now()) throw new Error('로그인 요청이 만료되었습니다.');
    const session = this.accounts.signIn(subject);
    if (session) return { origin: attempt.origin, session, key: null };
    if (this.attempts.size >= 1000) throw new Error('로그인 요청이 많습니다.');
    const pending = random();
    this.attempts.set(pending, { origin: attempt.origin, expiresAt: Date.now() + 600000, subject });
    return { origin: attempt.origin, session: null, key: pending };
  }
  complete(key: string | undefined, input: unknown) {
    this.prune();
    const attempt = key ? this.attempts.get(key) : undefined;
    if (!key || !attempt || !('subject' in attempt)) throw new Error('Google 인증을 다시 진행해주세요.');
    const session = this.accounts.signUp(attempt.subject, input);
    this.attempts.delete(key);
    return session;
  }

  dispose(): void { this.disposed = true; this.attempts.clear(); }
}
