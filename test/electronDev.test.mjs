import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, cp, writeFile, readFile, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

test('Electron dev promotes only successful builds and terminates its child', { timeout: 10000 }, async () => {
 const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'composer-electron-dev-')));
 await mkdir(path.join(root, 'src'), { recursive: true });
 await mkdir(path.join(root, 'node_modules/electron'), { recursive: true });
 await cp(new URL('../components/01-base/electron-backend/files/scripts', import.meta.url), path.join(root, 'scripts'), { recursive: true });
 await writeFile(path.join(root, 'node_modules/electron/package.json'), JSON.stringify({ main: 'index.cjs' }));
 await writeFile(path.join(root, 'node_modules/electron/index.cjs'), 'module.exports = process.execPath;');
 await writeFile(path.join(root, 'package.json'), JSON.stringify({ type: 'module', scripts: { build: 'node scripts/fixtureBuild.mjs' } }));
 const log = path.join(root, 'events');
 await writeFile(path.join(root, 'scripts/fixtureBuild.mjs'), `
 import { mkdir, writeFile, readFile, appendFile } from 'node:fs/promises';
 const version = await readFile('src/version', 'utf8');
 if(version === 'bad') { await appendFile(${JSON.stringify(log)}, 'failed\\n'); process.exit(1); }
 for(const dir of ['backend','preload','shell']) await mkdir('dist/'+dir,{recursive:true});
 await writeFile('dist/preload/index.cjs',''); await writeFile('dist/shell/index.html','');
 await writeFile('dist/backend/index.js', 'import {appendFileSync} from "node:fs"; const log='+${JSON.stringify(JSON.stringify(log))}+'; appendFileSync(log,JSON.stringify({pid:process.pid,version:'+JSON.stringify(version)+'})+"\\\\n"); process.on("SIGTERM",()=>process.exit(0));setInterval(()=>{},1000);');
 `);
 await writeFile(path.join(root, 'src/version'), 'one');
 const child = spawn(process.execPath, ['scripts/electronDev.mjs'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
 let output = ''; child.stdout.on('data', bytes => { output += bytes; }); child.stderr.on('data', bytes => { output += bytes; });
 const exit = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
 async function events() { return (await readFile(log, 'utf8').catch(() => '')).trim().split('\n').filter(Boolean); }
 async function until(predicate) {
   const deadline = Date.now() + 5000;
   while (!(await predicate())) { if (Date.now() > deadline) assert.fail(output); await delay(20); }
 }
 let first, second;
 try {
   await until(async () => (await events()).some(line => line.startsWith('{')));
   first = JSON.parse((await events()).find(line => line.startsWith('{')));
   const built = await readFile(path.join(root, 'dist/backend/index.js'), 'utf8');
   await writeFile(path.join(root, 'src/version'), 'bad');
   await until(async () => (await events()).includes('failed'));
   process.kill(first.pid, 0);
   assert.equal(await readFile(path.join(root, 'dist/backend/index.js'), 'utf8'), built);
   await writeFile(path.join(root, 'src/version'), 'two');
   await until(async () => (await events()).filter(line => line.startsWith('{')).length === 2);
   second = JSON.parse((await events()).filter(line => line.startsWith('{'))[1]);
   assert.equal(second.version, 'two'); assert.notEqual(second.pid, first.pid);
   assert.throws(() => process.kill(first.pid, 0), { code: 'ESRCH' });
   child.kill('SIGTERM'); assert.deepEqual(await exit, { code: 0, signal: null });
   assert.throws(() => process.kill(second.pid, 0), { code: 'ESRCH' });
 } finally {
   child.kill('SIGTERM'); await exit;
   for (const entry of [first, second]) if (entry) { try { process.kill(entry.pid, 'SIGKILL'); } catch {} }
 }
});
