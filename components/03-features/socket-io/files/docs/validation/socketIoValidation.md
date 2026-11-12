# Socket.IO 사용자 검증

이번 구현의 설치·타입·단위·loopback·실제 연결·제한시간 검사는 에이전트가 실행하지 않았습니다. Node 24.22.1 이상, 패키지 레지스트리 접근, 별도 임시 앱을 사용하세요. 기존 project/ 앱은 검사 대상으로 사용하지 않습니다.

## Composer 조립 검사

Composer 저장소 루트에서 실행합니다.

```sh
node --test test/composition.test.mjs test/communicationExpansion.test.mjs
```

기대 결과: 표준 6개 구성의 허용/금지·필수 통신, Socket.IO의 HTTP 단일 인스턴스·시작 순서와 SOCKET_IO_AUTO_START 접두사, MQTT 수동 시작 선택, Electron의 필수 IPC가 유지됩니다.

## 임시 앱 생성과 설치·타입·기본 검사·빌드

Composer 루트에서 실행합니다. 소스 출력·독립 Git 초기화만 수행합니다.

```sh
node --input-type=module <<'JS'
import { mkdtemp, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { generateProject } from './scripts/generate.mjs';
const parent = await realpath(await mkdtemp(path.join(os.tmpdir(), 'composer-socketIo-')));
const { app } = await generateProject({ parent, name: 'validation', selection: { configuration: 'typescript-backend', communications: ['socketIo'] }, verify: false });
console.log(app);
JS
```

출력된 앱 경로로 이동해 다음을 실행합니다.

```sh
npm run verify
```

기대 결과는 설치 → 전체 check → 기본 test → build 통과와 상태 활성화입니다. MQTT의 외부 브로커 검사는 기본 test에서 제외됩니다. 기본 검사 통과는 실제 외부 연결·부하·GUI 성공을 의미하지 않습니다.

실패하면 소스·package-lock·.composer/diagnostic.json을 보존하고 실패 단계 원인을 확인한 뒤 `npm run verify`로 재시도합니다. state나 원본 해시는 직접 고치지 않습니다. 실제 .env는 사용자가 선택 키만 작성하고 비밀값은 커밋하지 않습니다.

## 실제 실행과 추가 확인

앱 경로에서 설정을 작성한 뒤 `npm start`로 빌드 결과, `npm run dev`로 개발 실행을 확인합니다. 정상 중단·Ctrl+C 이후 포트/구독·타이머·자식 프로세스가 남지 않아야 합니다. 아래 확인은 별도로 직접 진행하고 결과를 기록합니다.

HTTP_ALLOWED_ORIGINS=http://localhost:5173을 사용자 .env에 지정하고 `npm start`를 실행합니다. 기본 HTTP_PORT는 3000이며 변경했다면 아래 client 주소도 바꿉니다. 토큰을 설정한 서버에는 별도 client 터미널에서도 같은 SOCKET_IO_AUTH_TOKEN을 비밀 환경 변수로 지정합니다. 외부 bind·Origin 없는 client에는 토큰이 필수입니다.

별도 터미널에서 새 임시 client만 설치해 실행합니다. 생성 앱의 패키지·lock은 변경하지 않습니다.

```sh
taskSocketClientDir="$(mktemp -d)"
cd "$taskSocketClientDir"
npm init -y
npm install --save-exact socket.io-client@4.8.4
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
for (const transport of ['polling', 'websocket']) {
  const socket = io('http://127.0.0.1:3000', {
    transports: [transport], reconnection: false, timeout: 5000,
    extraHeaders: { Origin: 'http://localhost:5173' },
    auth: process.env.SOCKET_IO_AUTH_TOKEN ? { token: process.env.SOCKET_IO_AUTH_TOKEN } : {},
  });
  try {
    await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
    const reply = await socket.timeout(5000).emitWithAck('request', { route: 'missingRoute', payload: null });
    assert.equal(reply.ok, false); assert.equal(reply.error.code, 'notFound');
    console.log(transport, 'connected; missing route rejected');
  } finally { socket.disconnect(); }
}
JS
```

기대 결과: 같은 HTTP 포트로 polling/WebSocket이 각각 연결되고 미등록 route는 안전한 notFound ack를 반환합니다. 기본 socketIo.test.ts는 허용/거부 Origin·HTTP stop 보호·Socket.IO 중단 후 HTTP 404 유지·각각 재시작을 검사합니다. 해당 검사만 다시 확인할 때는 앱 경로에서 `node --test test/backend/socketIo.test.ts`를 실행합니다.

Origin을 허용 목록과 다르게 바꾸면 양쪽 transport에서 연결이 거부되어야 합니다. 토큰 설정 시 누락·잘못된 토큰도 거부되어야 합니다. Origin 헤더를 제거하면 토큰 없는 연결은 실패해야 합니다. auth token을 query/header로 옮겨 우회할 수 없어야 합니다.

사용자 임시 Bridge에서 응답·예외·잘못된 JSON 결과·보류 작업을 준비하고 64 KiB·소켓당 1개·전역 64개·30초 timeout ack를 확인합니다. 실제 업무 완료 전 처리 자리는 반환되지 않아야 합니다. 같은 소켓의 재요청은 busy, 내부 오류에는 스택·비밀값이 없어야 합니다. ack 없는 request는 연결을 종료합니다.

stop 5초 초과는 실패로 전달하고 늦은 결과는 ack하지 않아야 합니다. Socket.IO 중단 후 일반 HTTP와 정적 웹이 별도 연결에서 계속 응답하고, 다시 start했을 때 중복 리스너가 없어야 합니다. 같은 객체가 Bridge와 Service에 공유되는지, Main IPC와 HTTP·TCP·UDP·MQTT를 함께 선택한 부분 시작 실패가 모두 역순 정리되는지도 새 임시 앱에서 확인합니다.
