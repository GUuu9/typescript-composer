const nodeProtocols = ['http', 'tcp', 'udp', 'mqtt', 'socketIo'];
export const configurations = [
  { id: 'typescript-backend', bases: ['node-backend'], areas: ['backend'], frameworks: ['node'], allowed: nodeProtocols, required: [], explicit: true, implemented: true, implementedProtocols: nodeProtocols, targets: ['node'] },
  { id: 'web-app', bases: ['frontend'], areas: ['frontend'], frameworks: ['react'], allowed: ['http'], required: [], implemented: true, implementedProtocols: ['http'], targets: ['web-app'] },
  { id: 'web-phaser', bases: ['phaser'], areas: ['frontend'], frameworks: ['react', 'phaser'], allowed: ['http'], required: [], implemented: true, implementedProtocols: ['http'], targets: ['web-phaser'] },
  { id: 'backend-webui', bases: ['node-backend', 'frontend'], areas: ['backend', 'frontend'], frameworks: ['node', 'react'], allowed: nodeProtocols, required: ['http'], delivery: 'integrated', implemented: true, implementedProtocols: nodeProtocols, targets: ['backend-webui', 'backend-webui-integrated'] },
  { id: 'electron-app', bases: ['electron-backend', 'frontend'], areas: ['backend', 'frontend', 'preload'], frameworks: ['node', 'electron', 'react'], allowed: ['ipc', ...nodeProtocols], required: ['ipc'], implemented: true, implementedProtocols: ['ipc', ...nodeProtocols], targets: ['electron-app'] },
  { id: 'electron-phaser', bases: ['electron-backend', 'phaser'], areas: ['backend', 'frontend', 'preload'], frameworks: ['node', 'electron', 'react', 'phaser'], allowed: ['ipc', ...nodeProtocols], required: ['ipc'], implemented: true, implementedProtocols: ['ipc', ...nodeProtocols], targets: ['electron-phaser'] },
];

export const optionalFeatures = [{ id: 'logger', area: 'backend', label: '오류 추적 로그 Service', implemented: true }];
export function availableFeatures(entry) { return optionalFeatures.filter(feature => entry.areas.includes(feature.area)); }

export function normalizeSelection({ configuration, communications, features = [], delivery, autoStart = {} }) {
  const entry = configurations.find(item => item.id === configuration);
  if (!entry) throw new Error(`알 수 없는 구성: ${configuration}`);
  if (!Array.isArray(features) || features.some(item => typeof item !== 'string')) throw new Error('기능 목록이 잘못되었습니다.');
  if (communications === undefined && entry.explicit) throw new Error('None 또는 통신을 명시적으로 선택하세요.');
  communications ??= entry.required.length ? entry.required : ['none'];
  if (!Array.isArray(communications) || !communications.length) throw new Error('통신 선택에는 none 또는 프로토콜이 필요합니다.');
  if (communications.includes('none') && communications.length !== 1) throw new Error('None과 통신을 동시에 선택할 수 없습니다.');
  if (communications.includes('none') && entry.required.length) throw new Error('필수 통신을 제거할 수 없습니다.');
  if (communications.some(item => item !== 'none' && !entry.allowed.includes(item))) throw new Error('구성에서 허용하지 않는 통신입니다.');
  if (delivery !== undefined && (entry.id !== 'backend-webui' || delivery !== 'integrated')) throw new Error('허용하지 않는 제공 방식입니다.');
  const protocols = [...new Set([...entry.required, ...communications.filter(item => item !== 'none')])];
  if (protocols.includes('socketIo') && !protocols.includes('http')) protocols.push('http');
  if (!autoStart || typeof autoStart !== 'object' || Array.isArray(autoStart) || Object.entries(autoStart).some(([protocol, value]) => !protocols.includes(protocol) || typeof value !== 'boolean' || (entry.required.includes(protocol) && !value) || !entry.areas.includes('backend'))) throw new Error('자동 시작 설정이 잘못되었거나 필수 통신을 중단했습니다.');
  if (protocols.includes('socketIo') && (autoStart.socketIo ?? true) && autoStart.http === false) throw new Error('자동 시작 Socket.IO에는 HTTP 자동 시작이 필요합니다.');
  const area = entry.areas.includes('backend') ? 'backend' : 'frontend';
  const selectedCommunications = { [area]: protocols.sort().map(protocol => ({ protocol, autoStart: entry.areas.includes('backend') ? (autoStart[protocol] ?? true) : false })) };
  if (['electron-app', 'electron-phaser'].includes(entry.id)) selectedCommunications.frontend = [{ protocol: 'ipc', autoStart: false }];
  if (entry.id === 'backend-webui') selectedCommunications.frontend = [{ protocol: 'http', autoStart: false }];
  return {
    entry,
    configuration: { id: entry.id, delivery: delivery ?? entry.delivery ?? null, communications: selectedCommunications },
    features: [...new Set(features)].sort(),
  };
}

export function requireImplemented(selection) {
  if (!selection.entry.implemented || Object.values(selection.configuration.communications).some(items => items.some(item => !selection.entry.implementedProtocols?.includes(item.protocol))) || selection.features.some(id => !availableFeatures(selection.entry).some(feature => feature.id === id && feature.implemented))) {
    throw new Error('현재 생성 가능한 구성은 표준 6개 구성의 허용된 None/HTTP/TCP/UDP/MQTT/Socket.IO/IPC입니다. 선택 Service는 해당 구성의 logger만 지원하며 다른 Service·util은 아직 없습니다.');
  }
}
