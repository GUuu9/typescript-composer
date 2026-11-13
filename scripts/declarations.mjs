import path from 'node:path';

const fail = message => { throw new Error(message); };
export function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label}: 객체가 필요합니다.`);
  return value;
}
export function keys(value, allowed, label) {
  object(value, label);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`${label}: 알 수 없는 필드 ${key}`);
}
function strings(value, label, allowed) {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !item || (allowed && !allowed.includes(item))) || new Set(value).size !== value.length) fail(`${label}: 잘못된 목록`);
}
export function safePath(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || /[\x00-\x1f\x7f:"<>|?*]/.test(value) || path.posix.isAbsolute(value) || path.posix.normalize(value) !== value || value.split('/').some(part => !part || part === '..' || part === '.' || /[. ]$/.test(part))) fail(`안전하지 않은 상대 경로: ${value}`);
  if (value.split('/').some(part => ['.git', 'node_modules', 'dist', 'release'].includes(part.toLowerCase()) || (/^\.env(?:\.|$)/i.test(part) && part !== '.env.example') || /\.(?:pem|key|p12|pfx)$/i.test(part) || /^id_(?:rsa|ed25519|ecdsa)$/i.test(part))) fail(`보호 경로: ${value}`);
  return value;
}
const reserved = new Set('await break case catch class const continue debugger default delete do else enum export extends false finally for function if implements import in instanceof interface let new null package private protected public return static super switch this throw true try typeof var void while with yield constructor prototype __proto__'.split(' '));
export function identifier(value, camel = false) {
  if (typeof value !== 'string' || !(camel ? /^[a-z][a-zA-Z0-9]*$/ : /^[a-zA-Z][a-zA-Z0-9]*$/).test(value) || reserved.has(value)) fail(`잘못된 식별자: ${value}`);
  return value;
}
function stringMap(value, label) {
  object(value, label);
  for (const [key, item] of Object.entries(value)) if (!key || typeof item !== 'string' || !item || ['__proto__', 'constructor', 'prototype'].includes(key)) fail(`${label}: 잘못된 값`);
}
export function validateDeclaration(input) {
  keys(input, ['schemaVersion', 'id', 'version', 'kind', 'areas', 'frameworks', 'requires', 'packages', 'scripts', 'environment', 'filePolicies', 'replaceableFiles', 'replacements', 'registrations', 'communications', 'ipcRoutes'], 'compose.json');
  if (input.schemaVersion !== 1 || !/^[a-z][a-z0-9-]*$/.test(input.id ?? '') || typeof input.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(input.version) || !['common', 'base', 'target', 'feature'].includes(input.kind)) fail('구성품 식별·버전·종류·스키마가 잘못되었습니다.');
  strings(input.areas, 'areas', ['backend', 'frontend', 'preload', 'shared']);
  const result = { frameworks: [], requires: [], packages: {}, scripts: {}, environment: {}, filePolicies: {}, replaceableFiles: [], replacements: [], registrations: [], communications: [], ipcRoutes: [], ...input };
  strings(result.frameworks, 'frameworks', ['node', 'electron', 'react', 'phaser']);
  strings(result.requires, 'requires');
  keys(result.packages, ['dependencies', 'devDependencies'], 'packages');
  for (const [kind, entries] of Object.entries(result.packages)) {
    stringMap(entries, kind);
    for (const [name, version] of Object.entries(entries)) if (!/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(name) || !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version)) fail(`정확한 패키지 버전 필요: ${name}`);
  }
  stringMap(result.scripts, 'scripts');
  object(result.environment, 'environment');
  for (const [key, value] of Object.entries(result.environment)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) fail(`잘못된 환경 키: ${key}`);
    keys(value, ['description', 'required', 'secret'], key);
    if (typeof value.description !== 'string' || !value.description || /[\r\n]/.test(value.description) || typeof value.required !== 'boolean' || typeof value.secret !== 'boolean') fail(`잘못된 환경 선언: ${key}`);
  }
  object(result.filePolicies, 'filePolicies');
  for (const [file, policy] of Object.entries(result.filePolicies)) {
    safePath(file);
    if (!['user', 'generated'].includes(policy)) fail(`잘못된 파일 소유권: ${file}`);
    if (policy === 'generated' && file !== 'src/shared/ipcRoutes.manifest.ts' && !/^src\/(?:backend\/core|frontend\/core\/di)\/features\.manifest\.ts$/.test(file)) fail(`사용자 파일은 생성기 소유로 선언할 수 없습니다: ${file}`);
  }
  strings(result.replaceableFiles, 'replaceableFiles');
  result.replaceableFiles.forEach(safePath);
  if (result.replaceableFiles.length && result.kind !== 'base') fail('base만 교체 가능 파일을 선언할 수 있습니다.');
  if (!Array.isArray(result.replacements) || !Array.isArray(result.registrations)) fail('교체·등록은 배열이어야 합니다.');
  if (result.replacements.length && result.kind !== 'target') fail('target만 파일을 교체할 수 있습니다.');
  const replaced = new Set();
  for (const value of result.replacements) {
    keys(value, ['path', 'owner'], 'replacement');
    safePath(value.path);
    if (typeof value.owner !== 'string' || !value.owner || replaced.has(value.path)) fail('잘못된 교체 소유자 또는 중복 교체');
    replaced.add(value.path);
  }
  for (const value of result.registrations) {
    keys(value, ['name', 'area', 'module', 'factory', 'dependencies', 'lifecycle'], 'registration');
    identifier(value.name, true);
    identifier(value.factory);
    safePath(value.module);
    if (!['backend', 'frontend'].includes(value.area) || !result.areas.includes(value.area) || !value.module.startsWith(`src/${value.area}/`) || !value.module.endsWith('.ts')) fail('등록 영역과 모듈 경로가 일치하지 않습니다.');
    object(value.dependencies, 'dependencies');
    for (const [key, dependency] of Object.entries(value.dependencies)) { identifier(key, true); identifier(dependency, true); }
    strings(value.lifecycle, 'lifecycle', ['initialize', 'dispose']);
  }
  if (!Array.isArray(result.communications)) fail('communications는 배열이어야 합니다.');
  for (const value of result.communications) {
    keys(value, ['registration', 'area', 'configModule', 'configFactory', 'protocol', 'failure'], 'communication');
    if (value.failure !== undefined && typeof value.failure !== 'boolean') fail('failure는 boolean이어야 합니다.');
    identifier(value.registration, true);
    identifier(value.configFactory);
    safePath(value.configModule);
    if (value.area !== 'backend' || !result.areas.includes(value.area) || !value.configModule.startsWith('src/backend/') || !value.configModule.endsWith('.ts') || !['http', 'ipc'].includes(value.protocol)) fail('지원하지 않는 통신 선언입니다.');
  }
  if (!Array.isArray(result.ipcRoutes)) fail('ipcRoutes는 배열이어야 합니다.');
  for (const route of result.ipcRoutes) {
    keys(route, ['path', 'method', 'channel', 'registration'], 'ipcRoute');
    identifier(route.method, true);
    identifier(route.registration, true);
    if (!result.areas.includes('backend') || !result.frameworks.includes('electron')
      || typeof route.path !== 'string' || !/^\/[a-zA-Z0-9/-]*$/.test(route.path)
      || !/^[a-z][a-zA-Z0-9]*:[a-z][a-zA-Z0-9]*$/.test(route.channel ?? '')) fail('잘못된 IPC 경로 선언');
  }
  return result;
}
