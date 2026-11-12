import { spawn } from 'node:child_process';
import { setTimeout as pause } from 'node:timers/promises';
import { watch } from 'node:fs';
import { cp, mkdir, mkdtemp, rename, rm, symlink, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { electronBinary, builtEntry } from './electronStart.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
let app, build;
let stopping = false, intentional = false, dirty = false;
let work, closing, timer;
const watchers = [];
function launch(command, args, cwd) {
  const child = spawn(command, args, { cwd, stdio: 'inherit', detached: process.platform !== 'win32' });
  const done = new Promise(resolve => {
    child.once('error', () => resolve(1));
    child.once('exit', (code, signal) => resolve(signal ? 1 : code ?? 1));
  });
  return { child, done };
}
function kill(job, signal) {
  if (!job?.child.pid) return;
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/PID', String(job.child.pid), '/T', ...(signal === 'SIGKILL' ? ['/F'] : [])], { stdio: 'ignore' });
    } else process.kill(-job.child.pid, signal);
  } catch (error) { if (error.code !== 'ESRCH') throw error; }
}
async function stop(job) {
  if (!job) return;
  kill(job, 'SIGTERM');
  const deadline = setTimeout(() => kill(job, 'SIGKILL'), 6500);
  try {
    await job.done;
    if (process.platform !== 'win32' && job.child.pid) {
      const end = Date.now() + 8000;
      while (true) {
        try { process.kill(-job.child.pid, 0); } catch (error) { if (error.code === 'ESRCH') break; throw error; }
        if (Date.now() > end) { kill(job, 'SIGKILL'); throw new Error('Child process cleanup failed'); }
        await pause(50);
      }
    }
  } finally { clearTimeout(deadline); }
}
async function rebuild() {
  const stage = await mkdtemp(path.join(root, '.composer/build-'));
  try {
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (entry.name === 'src' || entry.name === 'scripts' || entry.name === 'package.json' || /^tsconfig.*\.json$/.test(entry.name)) {
        await cp(path.join(root, entry.name), path.join(stage, entry.name), { recursive: true });
      }
    }
    await symlink(path.join(root, 'node_modules'), path.join(stage, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    if (stopping) return;
    build = launch(npm, ['run', 'build'], stage);
    const status = await build.done;
    build = undefined;
    if (stopping) return;
    if (status !== 0) { console.error('Build failed; the previous application is preserved.'); return; }
    intentional = true;
    await stop(app); app = undefined;
    if (stopping) return;
    const previous = path.join(stage, 'previous');
    let hadPrevious = false;
    try { await rename(path.join(root, 'dist'), previous); hadPrevious = true; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    try { await rename(path.join(stage, 'dist'), path.join(root, 'dist')); }
    catch (error) {
      if (hadPrevious) await rename(previous, path.join(root, 'dist'));
      throw error;
    }
    app = launch(await electronBinary(), [await builtEntry()], root);
    intentional = false;
    const current = app;
    void current.done.then(() => {
      if (!stopping && !intentional && app === current) {
        console.error('Electron exited unexpectedly.'); process.exitCode = 1; void close();
      }
    });
  } finally { await rm(stage, { recursive: true, force: true }); }
}
function schedule() {
  if (stopping) return;
  dirty = true;
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (work) return;
    work = (async () => {
      while (dirty && !stopping) { dirty = false; await rebuild(); }
    })().catch(error => {
      console.error(error.message); process.exitCode = 1; void close();
    }).finally(() => { work = undefined; });
  }, 120);
}
function close() {
  if (closing) return closing;
  stopping = true; clearTimeout(timer);
  for (const watcher of watchers) watcher.close();
  closing = (async () => { await Promise.all([stop(app), stop(build)]); await work; })().catch(error => { console.error(error.message); process.exitCode = 1; });
  return closing;
}
process.on('SIGINT', () => { void close(); });
process.on('SIGTERM', () => { void close(); });
try {
  await electronBinary();
  await mkdir(path.join(root, '.composer'), { recursive: true });
  for (const directory of ['src', 'scripts']) {
    const watcher = watch(path.join(root, directory), { recursive: true }, schedule);
    watcher.on('error', error => { console.error(error.message); process.exitCode = 1; void close(); });
    watchers.push(watcher);
  }
  const watcher = watch(root, (event, name) => {
    if (name && (name === '.env' || name === 'package.json' || /^tsconfig.*\.json$/.test(name))) schedule();
  });
  watcher.on('error', error => { console.error(error.message); process.exitCode = 1; void close(); });
  watchers.push(watcher);
  schedule();
} catch (error) { console.error(error.message); process.exitCode = 1; await close(); }
