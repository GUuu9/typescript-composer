import { loadEnvFile } from 'node:process';

export function loadEnvironment(): void {
  try {
    loadEnvFile(new URL('../../../.env', import.meta.url));
  } catch (cause) {
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') return;
    throw new Error('앱 루트의 .env 파일을 읽을 수 없습니다.', { cause });
  }
}

export function readAutoStart(key: string, fallback: boolean, required = false): boolean {
  const value = process.env[key];
  if (value !== undefined && value !== '' && value !== 'true' && value !== 'false') throw new Error(`${key}는 true 또는 false여야 합니다.`);
  const autoStart = value === undefined || value === '' ? fallback : value === 'true';
  if (required && !autoStart) throw new Error(`${key}로 필수 통신을 끌 수 없습니다.`);
  return autoStart;
}
