import { build } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { frontend } from './electronTarget.mjs';
const app = fileURLToPath(new URL('../', import.meta.url));
await build({ configFile: false, envDir: false, envPrefix: [], publicDir: false,
  build: { outDir: path.join(app, 'dist/preload'), emptyOutDir: true,
    lib: { entry: path.join(app, 'src/preload/index.ts'), formats: ['cjs'], fileName: () => 'index.cjs' },
    rolldownOptions: { external: ['electron'], output: { codeSplitting: false } },
  },
});
if (!frontend) {
  await mkdir(path.join(app, 'dist/shell'), { recursive: true });
  await writeFile(path.join(app, 'dist/shell/index.html'), `<!doctype html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'"><title>Application</title></head><body><main aria-label="Application"></main></body></html>`);
}
