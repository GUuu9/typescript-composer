import { spawn } from 'node:child_process';
const child = spawn(process.execPath, ['node_modules/electron/install.js'], { stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.once('error', () => { console.error('Electron download failed. Retry npm run setup:electron.'); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code ?? 1; });
