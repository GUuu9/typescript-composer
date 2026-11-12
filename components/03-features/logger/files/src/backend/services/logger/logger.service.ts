import { constants } from 'node:fs';
import { chmod, lstat, mkdir, open, readdir, realpath, rename, unlink } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { Initializable, Disposable } from '../../core/lifecycle/lifecycle.contract.ts';
import { readLoggerConfig, validateLoggerConfig } from '../../config/logger.config.ts';
import { formatLogRecord } from './logger.util.ts';
import type { LogContext, LogLevel, LoggerConfig } from './logger.model.ts';

// shortcut: one process writes a logs directory; add process coordination before multi-process logging.
const header = '{"logger":"typescript-composer","version":1}\n';
const maxFileBytes = 1024 * 1024;
const ranks = { debug: 0, info: 1, warn: 2, error: 3 };
const names = ['app.log', 'app.1.log', 'app.2.log', 'app.3.log', 'app.4.log'];
function missing(error: unknown): boolean { return !!error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'; }
function writeConsole(line: string, level: LogLevel): Promise<void> {
  const output = level === 'warn' || level === 'error' ? process.stderr : process.stdout;
  return new Promise((resolve, reject) => {
    const failed = (error: Error) => reject(error);
    output.once('error', failed);
    try {
      output.write(line, error => {
        if (error) reject(error);
        else { output.off('error', failed); resolve(); }
      });
    } catch (error) { output.off('error', failed); reject(error); }
  });
}
interface LoggerDependencies {
  config: LoggerConfig;
  rootDirectory?: string;
  writeConsole?: (line: string, level: LogLevel) => void | Promise<void>;
}

export class LoggerService implements Initializable, Disposable {
  #config: LoggerConfig;
  #root: string;
  #directory = '';
  #directoryIdentity: { dev: number; ino: number } | undefined;
  #console: NonNullable<LoggerDependencies['writeConsole']>;
  #file: FileHandle | undefined;
  #size = 0;
  #ready = false;
  #closing = false;
  #initialization: Promise<void> | undefined;
  #disposal: Promise<void> | undefined;
  #queue = Promise.resolve();
  #pending = 0;
  #failed = false;
  #failure: unknown;
  #reportedFailure = false;
  constructor(deps: LoggerDependencies) {
    this.#config = validateLoggerConfig(deps.config);
    this.#root = deps.rootDirectory ?? fileURLToPath(new URL('../../../../', import.meta.url));
    this.#console = deps.writeConsole ?? writeConsole;
  }
  initialize(): Promise<void> {
    if (this.#closing) return Promise.reject(new Error('Logger is disposed'));
    this.#initialization ??= (async () => {
      try {
        if (this.#config.output !== 'console') {
          this.#directory = path.join(await realpath(this.#root), 'logs');
          await mkdir(this.#directory, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
          const directory = await lstat(this.#directory);
          if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error('Logger directory must not be a symlink');
          this.#directoryIdentity = { dev: directory.dev, ino: directory.ino };
          await this.#validateFiles();
          await chmod(this.#directory, 0o700);
          await this.#openActive();
        }
        this.#ready = !this.#closing;
      } catch (error) {
        try { await this.#closeFile(); } catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Logger initialization cleanup failed', { cause: error }); }
        throw error;
      }
    })();
    return this.#initialization;
  }
  async #guardDirectory(): Promise<void> {
    const current = await lstat(this.#directory);
    const identity = this.#directoryIdentity;
    if (!identity || !current.isDirectory() || current.isSymbolicLink() || current.dev !== identity.dev || current.ino !== identity.ino) throw new Error('Logger directory changed');
  }
  async #validateFiles(): Promise<void> {
    await this.#guardDirectory();
    for (const name of await readdir(this.#directory)) {
      if (!names.includes(name)) throw new Error('Logger directory contains unmanaged files');
      const file = path.join(this.#directory, name);
      const before = await lstat(file);
      if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > maxFileBytes) throw new Error('Logger file is unsafe or too large');
      if (process.platform !== 'win32' && (before.mode & 0o777) !== 0o600) throw new Error('Logger files must have private 0600 permissions');
      const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const stat = await handle.stat();
        if (stat.dev !== before.dev || stat.ino !== before.ino || stat.size !== before.size) throw new Error('Logger file changed');
        const bytes = Buffer.alloc(stat.size);
        let offset = 0;
        while (offset < bytes.length) {
          const result = await handle.read(bytes, offset, bytes.length - offset, offset);
          if (!result.bytesRead) throw new Error('Logger file was truncated');
          offset += result.bytesRead;
        }
        if ((await handle.stat()).size !== stat.size) throw new Error('Logger file size changed');
        const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        if (!content.startsWith(header) || !content.endsWith('\n')) throw new Error('Logger file ownership or trailing record is invalid');
        for (const line of content.slice(header.length).split('\n').slice(0, -1)) {
          if (!line || Buffer.byteLength(line + '\n') > 16 * 1024) throw new Error('Invalid existing logger record');
          const record: unknown = JSON.parse(line);
          if (!record || typeof record !== 'object' || !('timestamp' in record) || typeof record.timestamp !== 'string' || !('level' in record) || !Object.hasOwn(ranks, String(record.level)) || !('event' in record) || typeof record.event !== 'string' || !/^[a-z][a-zA-Z0-9]{0,63}$/.test(record.event)) throw new Error('Invalid existing logger record');
        }
      } finally { await handle.close(); }
    }
  }
  async #openActive(): Promise<void> {
    await this.#guardDirectory();
    const file = path.join(this.#directory, names[0]!);
    const existing = await lstat(file).catch(error => { if (!missing(error)) throw error; return undefined; });
    if (existing && (!existing.isFile() || existing.isSymbolicLink() || existing.nlink !== 1)) throw new Error('Logger active file is unsafe');
    this.#file = await open(file, constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW | (existing ? 0 : constants.O_CREAT | constants.O_EXCL), 0o600);
    const stat = await this.#file.stat();
    if (!stat.isFile() || stat.nlink !== 1 || (existing && (stat.dev !== existing.dev || stat.ino !== existing.ino || stat.size !== existing.size))) throw new Error('Logger active file changed');
    await this.#file.chmod(0o600);
    if (!existing) await this.#file.writeFile(header, 'utf8');
    this.#size = existing ? stat.size : Buffer.byteLength(header);
  }
  async #closeFile(): Promise<void> {
    const file = this.#file;
    await file?.close();
    if (this.#file === file) this.#file = undefined;
  }
  async #append(line: string): Promise<void> {
    await this.#guardDirectory();
    const current = await lstat(path.join(this.#directory, names[0]!));
    const opened = await this.#file!.stat();
    if (!current.isFile() || current.nlink !== 1 || current.dev !== opened.dev || current.ino !== opened.ino || current.size !== this.#size) throw new Error('Logger active file was replaced or modified');
    if (this.#size + Buffer.byteLength(line) > maxFileBytes) {
      await this.#closeFile();
      await this.#validateFiles();
      await unlink(path.join(this.#directory, names[4]!)).catch(error => { if (!missing(error)) throw error; });
      for (let index = 3; index >= 0; index--) {
        await rename(path.join(this.#directory, names[index]!), path.join(this.#directory, names[index + 1]!)).catch(error => { if (!missing(error)) throw error; });
      }
      await this.#openActive();
    }
    await this.#file!.writeFile(line, 'utf8'); this.#size += Buffer.byteLength(line);
  }
  #remember(error: unknown): void { if (!this.#failed) { this.#failed = true; this.#failure = error; } }
  #record(level: LogLevel, event: string, error?: unknown, context?: LogContext): Promise<void> {
    if (!this.#ready || this.#closing) return Promise.reject(new Error('Logger is not ready or is disposed'));
    if (this.#failed) return Promise.reject(this.#failure);
    if (ranks[level] < ranks[this.#config.level]) return Promise.resolve();
    if (this.#pending >= 256) return Promise.reject(new Error('Logger queue capacity exceeded'));
    let line: string;
    try { line = formatLogRecord(level, event, error, context, new Date().toISOString()); } catch (failure) { return Promise.reject(failure); }
    this.#pending++;
    const task = this.#queue.then(async () => {
      if (this.#failed) throw this.#failure;
      if (this.#config.output !== 'console') await this.#append(line);
      if (this.#config.output !== 'file') await this.#console(line, level);
    }).finally(() => { this.#pending--; });
    this.#queue = task.catch(failure => this.#remember(failure));
    return task;
  }
  debug(event: string, context?: LogContext) { return this.#record('debug', event, undefined, context); }
  info(event: string, context?: LogContext) { return this.#record('info', event, undefined, context); }
  warn(event: string, context?: LogContext) { return this.#record('warn', event, undefined, context); }
  error(event: string, error: unknown, context?: LogContext) { return this.#record('error', event, error, context); }
  report(error: unknown, context?: LogContext): void {
    void this.error('communicationFailed', error, context).catch(failure => {
      this.#remember(failure);
      if (!this.#reportedFailure) { this.#reportedFailure = true; try { console.error('Logger could not record an error; flush/dispose will fail'); } catch {} }
    });
  }
  async flush(): Promise<void> { await this.#queue; if (this.#failed) throw this.#failure; }
  dispose(): Promise<void> {
    this.#closing = true;
    this.#disposal ??= (async () => {
      const errors: unknown[] = [];
      try { await this.#initialization; } catch (error) { errors.push(error); }
      try { await this.flush(); } catch (error) { errors.push(error); }
      try { await this.#closeFile(); } catch (error) { errors.push(error); }
      this.#ready = false;
      if (errors.length) throw new AggregateError(errors, 'Logger cleanup failed', { cause: errors[0] });
    })();
    return this.#disposal;
  }
}
export function createLoggerService(deps: Omit<LoggerDependencies, 'config'> & { config?: LoggerConfig } = {}): LoggerService {
  return new LoggerService({ ...deps, config: deps.config ?? readLoggerConfig() });
}
