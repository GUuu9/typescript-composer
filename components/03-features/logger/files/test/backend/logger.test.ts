import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, readFile, writeFile, stat, access, mkdir, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { LoggerService } from '../../src/backend/services/logger/logger.service.ts';
import { validateLoggerConfig } from '../../src/backend/config/logger.config.ts';

async function temporary(): Promise<string> { return realpath(await mkdtemp(path.join(os.tmpdir(), 'composer-logger-'))); }
test('console logging filters levels, restricts context and never invokes error getters', async () => {
  const root = await temporary(); const lines: string[] = [];
  const logger = new LoggerService({ config: { level: 'info', output: 'console' }, rootDirectory: root, writeConsole(line) { lines.push(line); } });
  await assert.rejects(logger.info('beforeReady'), /not ready/);
  await logger.initialize();
  await logger.debug('hidden'); await logger.info('ready', { traceId: 'trace-1' });
  const error = { name: 'Error', code: 'EIO', message: 'password=secret', get stack() { assert.fail('stack getter ran'); }, get cause() { assert.fail('cause getter ran'); } };
  await logger.error('operationFailed', error);
  await assert.rejects(logger.info('invalidContext', { password: 'secret' } as never), /tracing/);
  assert.equal(lines.length, 2); assert.equal(JSON.parse(lines[1]!).error.code, 'EIO');
  assert.ok(!lines.join('').includes('password')); assert.ok(!lines.join('').includes('secret'));
  await assert.rejects(access(path.join(root, 'logs')), { code: 'ENOENT' });
  const disposal = logger.dispose(); assert.equal(logger.dispose(), disposal); await disposal;
  await assert.rejects(logger.info('afterDispose'), /disposed/);
});
test('causes are bounded and stack output keeps locations without messages or URL secrets', async () => {
  const lines: string[] = []; const error: Record<string, unknown> = { name: 'Error', stack: 'secret\n    at work (file:///app/main.ts:12:3)\n    at https://user:secret@example.com/a.js:1:1\n    at work (file:///app/main.ts?token=secret:1:2)' }; error.cause = error;
  const logger = new LoggerService({ config: { level: 'debug', output: 'console' }, writeConsole(line) { lines.push(line); } });
  await logger.initialize(); await logger.error('failed', error); await logger.dispose();
  const record = JSON.parse(lines[0]!); assert.deepEqual(record.error.stack, ['file:///app/main.ts:12:3']);
  assert.equal(record.error.cause.truncated, true); assert.ok(!lines[0]!.includes('secret'));
});
test('file output rotates only recognized private files and keeps five files', async () => {
  const root = await temporary();
  const first = new LoggerService({ config: { level: 'info', output: 'file' }, rootDirectory: root });
  await first.initialize(); await first.dispose();
  const directory = path.join(root, 'logs'); const header = await readFile(path.join(directory, 'app.log'), 'utf8');
  const large = JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', event: 'fixture', error: { name: 'Error', stack: ['/' + 'x'.repeat(15000) + ':1:1'] } }) + '\n';
  await writeFile(path.join(directory, 'app.log'), header + large.repeat(Math.floor((1024 * 1024 - Buffer.byteLength(header)) / Buffer.byteLength(large))), { mode: 0o600 });
  for (let index = 1; index <= 4; index++) await writeFile(path.join(directory, `app.${index}.log`), header + JSON.stringify({ timestamp: new Date().toISOString(), level: 'info', event: `prior${index}` }) + '\n', { mode: 0o600 });
  const logger = new LoggerService({ config: { level: 'info', output: 'file' }, rootDirectory: root });
  await logger.initialize(); await logger.error('rotation', { name: 'Error', stack: 'ignored\n    at work (/' + 'x'.repeat(15000) + ':1:1)' }); await logger.dispose();
  assert.ok((await readFile(path.join(directory, 'app.4.log'), 'utf8')).includes('prior3'));
  assert.ok((await readFile(path.join(directory, 'app.log'), 'utf8')).includes('rotation'));
  for (const name of ['app.log', 'app.1.log', 'app.2.log', 'app.3.log', 'app.4.log']) {
    const file = await stat(path.join(directory, name)); assert.ok(file.size <= 1024 * 1024);
    if (process.platform !== 'win32') assert.equal(file.mode & 0o777, 0o600);
  }
});
test('unmanaged files and symlinks fail without overwriting user content', async () => {
  const root = await temporary(); await mkdir(path.join(root, 'logs'));
  const file = path.join(root, 'logs/app.log'); await writeFile(file, 'user content', { mode: 0o600 });
  const logger = new LoggerService({ config: { level: 'info', output: 'file' }, rootDirectory: root });
  await assert.rejects(logger.initialize(), /ownership/); assert.equal(await readFile(file, 'utf8'), 'user content');
  const other = await temporary(); const target = await temporary(); await symlink(target, path.join(other, 'logs'), process.platform === 'win32' ? 'junction' : 'dir');
  const linked = new LoggerService({ config: { level: 'info', output: 'file' }, rootDirectory: other });
  await assert.rejects(linked.initialize(), /symlink/);
});
test('queue overflow rejects while accepted writes can flush', async () => {
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  const logger = new LoggerService({ config: { level: 'info', output: 'console' }, writeConsole: () => gate });
  await logger.initialize(); const tasks = Array.from({ length: 256 }, () => logger.info('queued'));
  await assert.rejects(logger.info('overflow'), /capacity/); release(); await Promise.all(tasks); await logger.flush(); await logger.dispose();
});
test('write errors remain failures through flush and dispose', async () => {
  assert.throws(() => validateLoggerConfig({ level: 'bad', output: 'console' } as never), /LOGGER/);
  const original = new Error('sink failed');
  const logger = new LoggerService({ config: { level: 'info', output: 'console' }, writeConsole() { throw original; } });
  await logger.initialize(); await assert.rejects(logger.info('failure'), error => error === original);
  await assert.rejects(logger.flush(), error => error === original);
  await assert.rejects(logger.dispose(), error => { assert.ok(error instanceof AggregateError); assert.equal(error.cause, original); return true; });
});
