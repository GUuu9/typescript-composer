import { createServer, build, preview } from 'vite';
import { plugins } from './renderer.mjs';
import { loadEnvFile } from 'node:process';
import { access } from 'node:fs/promises';
import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as targetOptions from './webTarget.mjs';
const { backend, electron = false } = targetOptions;
import { normalizeApiBase } from '../src/frontend/apis/api.ts';


async function main() {
  const app = fileURLToPath(new URL('../', import.meta.url));
  try { loadEnvFile(path.join(app, '.env')); } catch (error) { if (error.code !== 'ENOENT') throw new Error('.env를 읽을 수 없습니다.', { cause: error }); }
  const action = process.argv[2];
  if (!['dev', 'build', 'preview'].includes(action)) throw new Error('웹 실행 역할이 잘못되었습니다.');
  const host = process.env.WEB_HOST || '127.0.0.1';
  if (host !== 'localhost' && !isIP(host)) throw new Error('WEB_HOST는 IP 주소 또는 localhost여야 합니다.');
  function port(key, fallback) {
    const value = process.env[key] || String(fallback);
    if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) throw new Error(`${key}는 1~65535의 정수여야 합니다.`);
    return Number(value);
  }
  const apiBase = normalizeApiBase(process.env.PUBLIC_API_BASE_URL || (backend ? '/api' : ''));
  const target = process.env.DEV_API_TARGET || 'http://127.0.0.1:3000';
  if (backend && action === 'dev') {
    let url;
    try { url = new URL(target); } catch { throw new Error('DEV_API_TARGET 형식이 잘못되었습니다.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('DEV_API_TARGET은 HTTP(S) origin이어야 합니다.');
  }
  const config = {
    configFile: false,
    root: path.join(app, 'src/frontend'),
    envDir: false,
    envPrefix: [],
    publicDir: false,
    clearScreen: false,
    base: electron ? './' : '/',
    plugins: [...plugins, ...(electron ? [{ name: 'electronCsp', transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'" }, injectTo: 'head-prepend' }] }] : [])],
    define: { 'import.meta.env.PUBLIC_API_BASE_URL': JSON.stringify(apiBase) },
    build: { outDir: path.join(app, 'dist/frontend'), emptyOutDir: true, target: 'es2022' },
    server: {
      host, port: port('WEB_PORT', 5173), strictPort: true,
      fs: { allow: [path.join(app, 'src/frontend'), path.join(app, 'src/shared')] },
      proxy: backend && action === 'dev' ? { '/api': { target, changeOrigin: false } } : undefined,
    },
    preview: { host, port: port('WEB_PREVIEW_PORT', 4173), strictPort: true },
  };
  if (electron && action !== 'build') throw new Error('Electron 화면은 npm run dev 또는 npm start로 실행하세요.');
  if (action === 'build') {
    await build(config);
  } else {
    if (action === 'preview') {
      try { await access(path.join(app, 'dist/frontend/index.html')); } catch { throw new Error('화면 빌드 결과가 없습니다. npm run build를 실행하세요.'); }
    }
    let server;
    try {
      server = action === 'dev' ? await createServer(config) : await preview(config);
      if (action === 'dev') await server.listen();
    } catch (error) {
      try { await server?.close(); } catch (cleanupError) { throw new AggregateError([error, cleanupError], '웹 시작과 정리에 실패했습니다.', { cause: error }); }
      throw error;
    }
    server.printUrls();
    let closing;
    const close = () => {
      closing ??= server.close();
      void closing.catch(() => { console.error('웹 서버 종료에 실패했습니다.'); process.exitCode = 1; });
    };
    process.on('SIGINT', close);
    process.on('SIGTERM', close);
  }
}

await main().catch(error => {
  console.error(error instanceof Error ? error.message : '웹 실행에 실패했습니다.');
  process.exitCode = 1;
});
