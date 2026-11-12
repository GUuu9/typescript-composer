import type { Api } from './api.ts';
import { normalizeApiBase } from './api.ts';

export class HttpApi implements Api {
  #baseUrl: string;
  #fetch: typeof fetch;

  constructor(baseUrl: string, fetcher: typeof fetch = fetch) {
    this.#baseUrl = normalizeApiBase(baseUrl);
    this.#fetch = fetcher;
  }

  async get(path: string, signal?: AbortSignal): Promise<unknown> {
    if (!this.#baseUrl) throw new Error('PUBLIC_API_BASE_URL을 설정하세요.');
    if (!path.startsWith('/') || path.startsWith('//') || /[\x00-\x20\x7f\\#]/.test(path)) throw new Error('Api 경로는 앱 상대 경로여야 합니다.');
    try {
      for (const segment of path.split('?')[0]!.split('/')) {
        const decoded = decodeURIComponent(segment);
        if (decoded === '.' || decoded === '..' || decoded.includes('/') || decoded.includes('\\')) throw new Error('Api 경로에 상위 이동이나 인코딩된 구분자를 사용할 수 없습니다.');
      }
    } catch (cause) { throw new Error('Api 경로 형식이 잘못되었습니다.', { cause }); }
    const response = await this.#fetch(this.#baseUrl.replace(/\/$/, '') + path, { method: 'GET', signal, credentials: 'same-origin', headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP 요청 실패 (${response.status})`);
    const type = response.headers.get('content-type')?.split(';')[0]?.trim();
    if (type !== 'application/json' && !type?.endsWith('+json')) throw new Error('JSON 응답이 필요합니다.');
    try { return await response.json(); } catch (cause) { throw new Error('JSON 응답을 읽을 수 없습니다.', { cause }); }
  }
}

export function createHttpApi(deps: { baseUrl?: string; fetcher?: typeof fetch }): HttpApi {
  return new HttpApi(deps.baseUrl ?? import.meta.env?.PUBLIC_API_BASE_URL ?? '', deps.fetcher ?? fetch);
}
