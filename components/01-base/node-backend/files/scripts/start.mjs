import { access } from 'node:fs/promises';
const entry = new URL('../dist/backend/index.js', import.meta.url);
try {
  await access(entry);
} catch {
  console.error('빌드 결과가 없습니다. npm run build 후 npm start를 실행하세요.');
  process.exitCode = 1;
}
if (!process.exitCode) await import(entry.href);
