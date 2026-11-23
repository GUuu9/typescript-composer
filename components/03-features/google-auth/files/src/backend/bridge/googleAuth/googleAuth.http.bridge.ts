import { Router, type Request, type Response } from 'express';
import type { HttpBridge } from '../../communications/http/http.contract.ts';
import type { GoogleAuthUsecase } from '../../usecases/googleAuth/googleAuth.usecase.ts';

function readFlowCookie(request: Request, name: string): string | undefined {
  const cookies = (request.headers.cookie ?? '').split(';').map(value => value.trim())
    .filter(value => value.startsWith(`${name}=`));
  const value = cookies.length === 1 ? cookies[0]?.slice(name.length + 1) : undefined;
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
}

export class GoogleAuthBridge implements HttpBridge {
  readonly name = 'googleAuth';
  private readonly router = Router();

  register(router: Router): void {
    router.use('/api/auth/google', this.router);
  }

  constructor(usecase: GoogleAuthUsecase, origins: readonly string[], secure: boolean, sessionCookieName: string) {
    const flowName = secure ? '__Host-google-auth-flow' : 'google-auth-flow';
    // Google에서 돌아오는 최상위 GET에 인증 시도 쿠키를 전달하기 위해 Lax를 사용한다.
    const flowCookie = { httpOnly: true, secure, sameSite: 'lax' as const, path: '/' };
    const sessionCookie = { httpOnly: true, secure, sameSite: 'strict' as const, path: '/' };
    const session = (response: Response, value: { token: string; expiresAt: number }) =>
      response.cookie(sessionCookieName, value.token, { ...sessionCookie, expires: new Date(value.expiresAt) });
    this.router.use((request, response, next) => {
      response.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
      if (request.method !== 'GET' && !origins.includes(request.headers.origin ?? '')) return response.status(403).json({ success: false, payload: 'Origin not allowed.' });
      if (request.path !== '/callback' && Object.keys(request.query).length) return response.status(400).json({ success: false, payload: 'Query is not allowed.' });
      next();
    });
    this.router.get('/status', (request, response) => response.json({ success: true, payload: usecase.status(readFlowCookie(request, flowName)) }));
    this.router.post('/start', (request, response) => {
      if (!request.is('application/json') || !request.body || typeof request.body !== 'object' || Array.isArray(request.body) || Object.keys(request.body).length) return response.status(400).json({ success: false, payload: 'Empty JSON object required.' });
      try {
        const result = usecase.begin(request.headers.origin!, readFlowCookie(request, flowName));
        response.cookie(flowName, result.key, { ...flowCookie, maxAge: 600000 });
        return response.json({ success: true, payload: { url: result.url } });
      } catch { return response.status(503).json({ success: false, payload: 'Google 로그인을 시작할 수 없습니다. 설정 또는 잠시 후 다시 시도를 확인해주세요.' }); }
    });
    this.router.get('/callback', async (request, response) => {
      const { state, code, error } = request.query;
      if (error || typeof state !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(state) || typeof code !== 'string' || !code || code.length > 4096) {
        response.clearCookie(flowName, flowCookie);
        return response.status(400).type('text').send('Google 로그인이 취소되었거나 만료되었습니다. 앱으로 돌아가 다시 시도해주세요.');
      }
      try {
        const result = await usecase.callback(readFlowCookie(request, flowName), state, code);
        if (result.session) { response.locals.userId = result.session.userId; session(response, result.session); response.clearCookie(flowName, flowCookie); }
        else response.cookie(flowName, result.key!, { ...flowCookie, maxAge: 600000 });
        return response.redirect(303, result.origin + '/');
      } catch {
        response.clearCookie(flowName, flowCookie);
        return response.status(400).type('text').send('Google 인증을 확인할 수 없습니다. 앱으로 돌아가 다시 로그인해주세요.');
      }
    });
    this.router.post('/complete', (request, response) => {
      if (!request.is('application/json') || !request.body || typeof request.body !== 'object' || Array.isArray(request.body)) return response.status(400).json({ success: false, payload: 'JSON required.' });
      try {
        const result = usecase.complete(readFlowCookie(request, flowName), request.body);
        response.locals.userId = result.userId;
        session(response, result); response.clearCookie(flowName, flowCookie);
        return response.json({ success: true, payload: { userId: result.userId, authProvider: 'google', expiresAt: result.expiresAt } });
      } catch { return response.status(400).json({ success: false, payload: '가입을 완료하지 못했습니다. Google 인증과 가입 정보를 다시 확인해주세요.' }); }
    });
  }
}
