import { lstat, realpath, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { Router } from 'express';
import type { HttpBridge } from '../../communications/http/http.contract.ts';

export class WebHttpBridge implements HttpBridge {
  readonly name = 'web';

  async register(router: Router): Promise<void> {
    // Development serves the frontend through Vite; built JS owns static delivery.
    if (import.meta.url.endsWith('.ts')) return;
    const root = path.resolve(fileURLToPath(new URL('../../../frontend/', import.meta.url)));
    const prepare = async () => {
      const directory = await lstat(root);
      if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error('화면 산출물 디렉터리가 잘못되었습니다.');
      const canonical = await realpath(root);
      const index = await realpath(path.join(root, 'index.html'));
      if (!index.startsWith(canonical + path.sep) || !(await stat(index)).isFile()) throw new Error('화면 빌드 결과가 없습니다. npm run build를 실행하세요.');
      return canonical;
    };
    // This validation is awaited by the HTTP adapter before it opens a listener.
    const prepared = await prepare();
    router.use(async (request, response, next) => {
      const canonical = prepared;
      if (!['GET', 'HEAD'].includes(request.method)) { next(); return; }
      let pathname: string;
      try { pathname = decodeURIComponent(request.originalUrl.split('?')[0]!); } catch { response.sendStatus(400); return; }
      if (!pathname.startsWith('/') || pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').some(segment => segment.startsWith('.'))) { response.sendStatus(404); return; }
      if (pathname === '/api' || pathname.startsWith('/api/')) { next(); return; }
      let file = path.resolve(canonical, '.' + pathname, ...(pathname === '/' ? ['index.html'] : []));
      try {
        file = await realpath(file);
        if (!file.startsWith(canonical + path.sep)) { response.sendStatus(404); return; }
        if (!(await stat(file)).isFile()) { next(); return; }
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
        if (path.extname(pathname) || pathname.startsWith('/assets/') || !request.get('accept')?.includes('text/html')) { next(); return; }
        file = path.join(canonical, 'index.html');
      }
      response.sendFile(file, { dotfiles: 'deny' });
    });
  }
}
