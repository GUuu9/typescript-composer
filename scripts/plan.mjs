import { readdir, readFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { configurations, normalizeSelection, requireImplemented } from './configurations.mjs';
import { safePath, validateDeclaration } from './declarations.mjs';

export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const ranks = { common: 0, base: 1, target: 2, feature: 3 };
export function orderDependencies(items, getId, getDependencies) {
  const byId = new Map();
  for (const item of items) {
    const id = getId(item);
    if (byId.has(id)) throw new Error(`중복 등록: ${id}`);
    byId.set(id, item);
  }
  const done = new Set();
  const visiting = new Set();
  const ordered = [];
  function visit(id) {
    if (done.has(id)) return;
    if (visiting.has(id)) throw new Error(`순환 의존성: ${id}`);
    const item = byId.get(id);
    if (!item) throw new Error(`누락 의존성: ${id}`);
    visiting.add(id);
    for (const dependency of [...getDependencies(item)].sort()) visit(dependency);
    visiting.delete(id);
    done.add(id);
    ordered.push(item);
  }
  for (const id of [...byId.keys()].sort()) visit(id);
  return ordered;
}
async function regularFile(file) {
  const stat = await lstat(file);
  if (!stat.isFile()) throw new Error(`일반 파일이 아닙니다: ${file}`);
  return readFile(file);
}
export async function readComponent(directory) {
  if (!(await lstat(directory)).isDirectory()) throw new Error(`구성품 디렉터리가 아닙니다: ${directory}`);
  const declarationBytes = await regularFile(path.join(directory, 'compose.json'));
  const declaration = validateDeclaration(JSON.parse(declarationBytes));
  const files = new Map();
  async function walk(directory, prefix = '') {
    if (!(await lstat(directory)).isDirectory()) throw new Error(`파일 디렉터리가 아닙니다: ${directory}`);
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relative = safePath(prefix + entry.name);
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`심볼릭 링크 거부: ${absolute}`);
      if (entry.isDirectory()) await walk(absolute, `${relative}/`);
      else {
        if (['package.json', 'package-lock.json', '.env.example', '.composer/state.json'].includes(relative)) throw new Error(`생성기 관리 파일의 중복 제공: ${relative}`);
        files.set(relative, await regularFile(absolute));
      }
    }
  }
  await walk(path.join(directory, 'files'));
  for (const file of [...Object.keys(declaration.filePolicies), ...declaration.replaceableFiles, ...declaration.replacements.map(item => item.path), ...declaration.registrations.map(item => item.module), ...declaration.communications.map(item => item.configModule)]) {
    if (!files.has(file)) throw new Error(`선언 파일 누락: ${file}`);
  }
  return { ...declaration, files, declarationHash: hash(declarationBytes) };
}
function merge(map, key, value, label) {
  if (map.has(key) && JSON.stringify(map.get(key)) !== JSON.stringify(value)) throw new Error(`${label} 충돌: ${key}`);
  map.set(key, value);
}
export function assemble(components, selection) {
  const byId = new Map(components.map(item => [item.id, item]));
  const ordered = orderDependencies(components, item => item.id, item => item.requires);
  ordered.sort((a, b) => ranks[a.kind] - ranks[b.kind]);
  const files = new Map();
  const paths = new Map();
  const pathNames = new Map();
  const packages = new Map();
  const scripts = new Map();
  const environment = new Map();
  const registrations = [];
  const communications = [];
  const ipcRoutes = [];
  const areas = new Set([...selection.entry.areas, 'shared']);
  for (const component of ordered) {
    for (const required of component.requires) if (ranks[byId.get(required).kind] > ranks[component.kind]) throw new Error('뒤 단계 구성품을 선행 의존성으로 사용할 수 없습니다.');
    if (component.areas.some(area => !areas.has(area)) || component.frameworks.some(framework => !selection.entry.frameworks.includes(framework))) throw new Error(`구성품 호환성 오류: ${component.id}`);
    for (const [file, bytes] of component.files) {
      safePath(file);
      const sourceArea = /^src\/(backend|frontend|preload|shared)(?:\/|$)/.exec(file)?.[1];
      const testArea = /^test\/(backend|frontend)(?:\/|$)/.exec(file)?.[1];
      if ([sourceArea, testArea].some(area => area && (!component.areas.includes(area) || !areas.has(area)))) throw new Error(`선언하지 않은 파일 영역: ${file}`);
      const segments = file.split('/');
      for (let index = 1; index <= segments.length; index++) {
        const prefix = segments.slice(0, index).join('/');
        const previous = pathNames.get(prefix.toLowerCase());
        if (previous && previous !== prefix) throw new Error(`대소문자 경로 충돌: ${prefix}, ${previous}`);
        pathNames.set(prefix.toLowerCase(), prefix);
      }
      const lower = file.toLowerCase();
      for (const [other, original] of paths) if ((other === lower && original !== file) || other.startsWith(`${lower}/`) || lower.startsWith(`${other}/`)) throw new Error(`경로 충돌: ${file}, ${original}`);
      const existing = files.get(file);
      let previousOwner;
      if (existing) {
        if (path.posix.basename(file) === '.gitkeep' && bytes.length === 0 && existing.bytes.length === 0) continue;
        const owner = byId.get(existing.owner);
        const replacement = component.replacements.find(item => item.path === file && item.owner === existing.owner);
        if (component.kind !== 'target' || owner.kind !== 'base' || !owner.replaceableFiles.includes(file) || !replacement) throw new Error(`파일 충돌: ${file}`);
        previousOwner = existing.owner;
      } else if (component.replacements.some(item => item.path === file)) throw new Error(`교체할 원본 파일 누락: ${file}`);
      paths.set(lower, file);
      files.set(file, { bytes, owner: component.id, policy: component.filePolicies[file] ?? 'user', ...(previousOwner && { previousOwner }) });
    }
    for (const [kind, entries] of Object.entries(component.packages)) for (const [name, version] of Object.entries(entries)) merge(packages, name, { kind, version }, '패키지');
    for (const [name, command] of Object.entries(component.scripts)) merge(scripts, name, command, '명령');
    for (const [key, entry] of Object.entries(component.environment)) merge(environment, key, { description: entry.description, required: entry.required, secret: entry.secret }, '환경');
    registrations.push(...component.registrations);
    communications.push(...component.communications);
    ipcRoutes.push(...component.ipcRoutes);
  }
  const orderedRegistrations = orderDependencies(registrations, item => `${item.area}:${item.name}`, item => Object.values(item.dependencies).map(name => `${item.area}:${name}`));
  const communicationKeys = new Set();
  for (const communication of communications) {
    const registration = orderedRegistrations.find(item => item.area === communication.area && item.name === communication.registration);
    const selected = selection.configuration.communications[communication.area]?.find(item => item.protocol === communication.protocol);
    const key = `${communication.area}:${communication.protocol}`;
    if (!registration || registration.lifecycle.length || !selected || communicationKeys.has(key) || communications.some(other => other !== communication && other.area === communication.area && other.registration === communication.registration)) throw new Error('통신 객체 누락·중복·수명 등록 또는 선택 충돌');
    communicationKeys.add(key);
  }
  for (const [area, entries] of Object.entries(selection.configuration.communications)) for (const entry of entries) {
    if (area === 'frontend') continue;
    if (!communicationKeys.has(`${area}:${entry.protocol}`)) throw new Error('선택 통신의 등록이 누락되었습니다.');
  }
  for (const key of ['path', 'method', 'channel', 'registration']) {
    if (new Set(ipcRoutes.map(route => route[key])).size !== ipcRoutes.length) throw new Error(`IPC 등록 충돌: ${key}`);
  }
  for (const route of ipcRoutes) {
    if (!communications.some(item => item.protocol === 'ipc') || !orderedRegistrations.some(item => item.area === 'backend' && item.name === route.registration && !communications.some(communication => communication.registration === item.name))) throw new Error('IPC Bridge 등록 누락 또는 통신 객체 충돌');
  }
  return { ipcRoutes, areas: [...selection.entry.areas], files, packages, scripts, environment, communications, registrations: orderedRegistrations, components: ordered, configuration: selection.configuration };
}
export async function createPlan(componentsRoot, input) {
  const selection = normalizeSelection(input);
  requireImplemented(selection);
  const inputs = [{ id: 'common', kind: 'common', directory: '00-common/project' }];
  if (selection.entry.areas.includes('backend')) inputs.push({ id: 'backend-common', kind: 'common', directory: '00-common/backend' });
  if (selection.entry.areas.includes('frontend')) inputs.push({ id: 'frontend-common', kind: 'common', directory: '00-common/frontend' });
  if (selection.entry.frameworks.includes('react')) inputs.push({ id: 'react-common', kind: 'common', directory: '00-common/react' });
  for (const id of selection.entry.bases) inputs.push({ id, kind: 'base', directory: `01-base/${id}` });
  for (const id of selection.entry.targets) inputs.push({ id, kind: 'target', directory: `02-targets/${id}` });
  if (selection.configuration.communications.backend?.some(item => item.protocol === 'http')) inputs.push({ id: 'http', kind: 'feature', directory: '03-features/http' });
  if (selection.configuration.communications.frontend?.some(item => item.protocol === 'http')) inputs.push({ id: 'http-client', kind: 'feature', directory: '03-features/http-client' });
  if (selection.configuration.communications.backend?.some(item => item.protocol === 'ipc')) inputs.push({ id: 'ipc', kind: 'feature', directory: '03-features/ipc' });
  if (selection.configuration.communications.frontend?.some(item => item.protocol === 'ipc')) inputs.push({ id: 'ipc-client', kind: 'feature', directory: '03-features/ipc-client' });
  const components = await Promise.all(inputs.map(async input => {
    const component = await readComponent(path.join(componentsRoot, input.directory));
    if (component.id !== input.id || component.kind !== input.kind) throw new Error(`구성품 식별자가 일치하지 않습니다: ${input.directory}`);
    return component;
  }));
  return assemble(components, selection);
}
export function generateManifest(registrations, area, communications = [], configuration, ipcRoutes = []) {
  const entries = registrations.filter(item => item.area === area);
  const core = area === 'frontend' ? 'src/frontend/core/di' : 'src/backend/core';
  const imports = [area === 'backend' ? `import type { LifecycleEntry } from './lifecycle/lifecycle.contract.ts';` : `import type { LifecycleEntry } from './lifecycle.contract.ts';`];
  if (area === 'backend') imports.push(`import type { CommunicationEntry } from './lifecycle/communication.contract.ts';`);
  const preparation = [];
  const communicationCalls = [];
  const selectedCommunications = communications.filter(item => item.area === area);
  selectedCommunications.forEach((item, index) => {
    let module = path.posix.relative(core, item.configModule);
    if (!module.startsWith('.')) module = `./${module}`;
    imports.push(`import { ${item.configFactory} as configFactory${index} } from ${JSON.stringify(module)};`);
    const selected = configuration.communications[area].find(entry => entry.protocol === item.protocol);
    const instanceIndex = entries.findIndex(entry => entry.name === item.registration);
    preparation.push(item.protocol === 'ipc' ? `  const autoStart${index} = ${selected.autoStart};` : `  const autoStart${index} = readAutoStart('${item.protocol.toUpperCase()}_AUTO_START', ${selected.autoStart}, ${configurations.find(entry => entry.id === configuration.id).required.includes(item.protocol)});`);
    preparation.push(`  const config${index} = autoStart${index} ? configFactory${index}() : undefined;`);
    communicationCalls.push(`    { name: '${item.registration}', autoStart: autoStart${index}, start: () => instance${instanceIndex}.start(config${index} ?? configFactory${index}()), stop: () => instance${instanceIndex}.stop(), dispose: () => instance${instanceIndex}.dispose()${item.failure ? `, failure: instance${instanceIndex}.failure` : ''} },`);
  });
  if (selectedCommunications.length) imports.push(`import { readAutoStart } from '../config/environment.config.ts';`);
  const calls = [];
  const instances = [];
  const lifecycle = [];
  entries.forEach((item, index) => {
    let module = path.posix.relative(core, item.module);
    if (!module.startsWith('.')) module = `./${module}`;
    imports.push(`import { ${item.factory} as factory${index} } from ${JSON.stringify(module)};`);
    const dependencies = Object.entries(item.dependencies).map(([key, name]) => {
      const dependency = `instance${entries.findIndex(entry => entry.name === name)}`;
      return `${key}: ${dependency}`;
    });
    calls.push(`  const instance${index} = factory${index}({ ${dependencies.join(', ')} }) satisfies object;`);
    instances.push(`${item.name}: instance${index}`);
    if (item.lifecycle.length) {
      const lifecycleDependencies = Object.values(item.dependencies).filter(name => entries.find(entry => entry.name === name)?.lifecycle.length);
      lifecycle.push(`    { name: '${item.name}', dependencies: ${JSON.stringify([...new Set(lifecycleDependencies)])}, ${item.lifecycle.map(method => `${method}: () => instance${index}.${method}()`).join(', ')} },`);
    }
  });
  if (area === 'backend') for (const route of ipcRoutes) {
    const ipc = selectedCommunications.find(item => item.protocol === 'ipc');
    const ipcIndex = entries.findIndex(item => item.name === ipc.registration);
    const bridgeIndex = entries.findIndex(item => item.name === route.registration);
    calls.push(`  instance${ipcIndex}.registerBridge(instance${bridgeIndex});`);
  }
  const communicationBlock = area === 'frontend' ? '' : selectedCommunications.length
    ? `  const communicationEntries: CommunicationEntry[] = [\n${communicationCalls.join('\n')}\n  ];\n`
    : `  const communicationEntries: CommunicationEntry[] = [];\n`;
  return `${imports.join('\n')}\n\nexport function createFeatures() {\n${preparation.length ? preparation.join('\n') + '\n' : ''}${calls.length ? calls.join('\n') + '\n' : ''}  const lifecycleEntries: LifecycleEntry[] = [\n${lifecycle.length ? lifecycle.join('\n') + '\n' : ''}  ];\n${communicationBlock}  return { instances: { ${instances.join(', ')} }, lifecycleEntries${area === 'backend' ? ', communicationEntries' : ''} };\n}\n`;
}
