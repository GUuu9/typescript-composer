import { readdir, lstat, readFile, writeFile, rename, link, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

export const workspaceName = 'typescript-composer.local.code-workspace';
async function directory(file) {
  const stat = await lstat(file);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`실제 디렉터리가 아닙니다: ${file}`);
}
export async function listProjects(root) {
  const project = path.join(root, 'project');
  await directory(project);
  return (await readdir(project, { withFileTypes: true }))
    .filter(entry => !entry.name.startsWith('.') && entry.isDirectory() && !entry.isSymbolicLink())
    .map(entry => entry.name).sort();
}
export function selectProjects(answer, projects) {
  const values = answer.split(',').map(value => value.trim());
  if (values.some(value => !/^[1-9]\d*$/.test(value) || Number(value) > projects.length)
    || new Set(values.map(Number)).size !== values.length) throw new Error('중복 없이 목록의 번호를 쉼표로 구분하세요.');
  return values.map(value => projects[Number(value) - 1]);
}
async function existingFile(file) {
  try {
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('workspace 경로가 일반 파일이 아닙니다.');
    return { stat, bytes: await readFile(file) };
  } catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
}
export async function createWorkspace(root, ask, report = console.log) {
  const projects = await listProjects(root);
  if (!projects.length) { report('선택할 프로젝트 폴더가 없습니다.'); return null; }
  projects.forEach((name, index) => report(`${index + 1}. ${name}`));
  const answer = (await ask('함께 열 폴더 번호 (쉼표 구분, Enter 취소): ')).trim();
  if (!answer) return null;
  const selected = selectProjects(answer, projects);
  const destination = path.join(root, workspaceName);
  const previous = await existingFile(destination);
  if (previous && !['y', 'yes'].includes((await ask('기존 workspace를 교체할까요? (y/N): ')).trim().toLowerCase())) return null;
  await directory(path.join(root, 'project'));
  for (const name of selected) await directory(path.join(root, 'project', name));
  const bytes = JSON.stringify({
    folders: [{ name: 'typescript-composer', path: '.' }, ...selected.map(name => ({ path: `project/${name}` }))],
    settings: { 'git.autoRepositoryDetection': true },
  }, null, 2) + '\n';
  const temporary = path.join(root, `.${workspaceName}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, bytes, { flag: 'wx' });
    if (previous) {
      const current = await existingFile(destination);
      if (!current || current.stat.ino !== previous.stat.ino || current.stat.dev !== previous.stat.dev
        || !current.bytes.equals(previous.bytes)) throw new Error('workspace가 변경되었습니다. 다시 실행하세요.');
      await rename(temporary, destination);
    } else {
      await link(temporary, destination);
    }
  } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  report(`생성: ${destination}\nVS Code에서 해당 workspace 파일을 여세요.`);
  return destination;
}
async function main() {
  if (process.argv.length > 2 || !stdin.isTTY || !stdout.isTTY) throw new Error('npm run workspace를 인자 없이 터미널에서 실행하세요.');
  const readline = createInterface({ input: stdin, output: stdout });
  const controller = new AbortController();
  readline.on('SIGINT', () => controller.abort());
  try {
    await createWorkspace(fileURLToPath(new URL('../', import.meta.url)), question => readline.question(question, { signal: controller.signal }));
  } finally { readline.close(); }
}
if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  main().catch(error => { console.error(error.name === 'AbortError' ? '취소했습니다.' : error.message); process.exitCode = 1; });
}
