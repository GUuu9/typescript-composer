export const configurations = [
  { id: 'typescript-backend', bases: ['node-backend'], areas: ['backend'], frameworks: ['node'], allowed: [], required: [], implemented: true, implementedProtocols: [], targets: ['node'] },
  { id: 'web-app', bases: ['frontend'], areas: ['frontend'], frameworks: ['react'], allowed: [], required: [], implemented: true, implementedProtocols: [], targets: ['web-app'] },
  { id: 'web-phaser', bases: ['phaser'], areas: ['frontend'], frameworks: ['react', 'phaser'], allowed: [], required: [], implemented: true, implementedProtocols: [], targets: ['web-phaser'] },
  { id: 'backend-webui', bases: ['node-backend', 'frontend'], areas: ['backend', 'frontend'], frameworks: ['node', 'react'], allowed: ['http'], required: ['http'], delivery: 'integrated', implemented: true, implementedProtocols: ['http'], targets: ['backend-webui', 'backend-webui-integrated'] },
  { id: 'electron-app', bases: ['electron-backend', 'frontend'], areas: ['backend', 'frontend', 'preload'], frameworks: ['node', 'electron', 'react'], allowed: ['ipc'], required: ['ipc'], implemented: true, implementedProtocols: ['ipc'], targets: ['electron-app'] },
  { id: 'electron-phaser', bases: ['electron-backend', 'phaser'], areas: ['backend', 'frontend', 'preload'], frameworks: ['node', 'electron', 'react', 'phaser'], allowed: ['ipc'], required: ['ipc'], implemented: true, implementedProtocols: ['ipc'], targets: ['electron-phaser'] },
];

export function normalizeSelection({ configuration, communications, features = [], delivery, autoStart = {} }) {
  const entry = configurations.find(item => item.id === configuration);
  if (!entry) throw new Error(`알 수 없는 구성: ${configuration}`);
  if (!Array.isArray(features) || features.length) throw new Error('추가 기능은 수동 연결 문서를 따르세요.');
  communications ??= entry.required.length ? entry.required : ['none'];
  if (!Array.isArray(communications) || !communications.length) throw new Error('통신 선택에는 none 또는 프로토콜이 필요합니다.');
  if (communications.includes('none') && communications.length !== 1) throw new Error('None과 통신을 동시에 선택할 수 없습니다.');
  if (communications.includes('none') && entry.required.length) throw new Error('필수 통신을 제거할 수 없습니다.');
  if (communications.some(item => item !== 'none' && !entry.allowed.includes(item))) throw new Error('구성에서 허용하지 않는 통신입니다.');
  if (delivery !== undefined && (entry.id !== 'backend-webui' || delivery !== 'integrated')) throw new Error('허용하지 않는 제공 방식입니다.');
  const protocols = [...new Set([...entry.required, ...communications.filter(item => item !== 'none')])];
  if (!autoStart || typeof autoStart !== 'object' || Array.isArray(autoStart) || Object.keys(autoStart).length) throw new Error('자동 시작 선택은 지원하지 않습니다.');
  const area = entry.areas.includes('backend') ? 'backend' : 'frontend';
  const selectedCommunications = { [area]: protocols.sort().map(protocol => ({ protocol, autoStart: entry.areas.includes('backend') ? true : false })) };
  if (['electron-app', 'electron-phaser'].includes(entry.id)) selectedCommunications.frontend = [{ protocol: 'ipc', autoStart: false }];
  if (entry.id === 'backend-webui') selectedCommunications.frontend = [{ protocol: 'http', autoStart: false }];
  return {
    entry,
    configuration: { id: entry.id, delivery: delivery ?? entry.delivery ?? null, communications: selectedCommunications },
  };
}

export function requireImplemented(selection) {
  if (!selection.entry.implemented) throw new Error('지원하지 않는 구성입니다.');
}
