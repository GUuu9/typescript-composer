# Socket.IO 통신

기존 HTTP 서버 하나를 공유하는 Socket.IO server입니다. polling·WebSocket 및 /socket.io/를 사용합니다. registerBridge({ name, handle(payload) })로 고정 request 이벤트의 { route, payload }를 처리하며 ack는 { ok: true, data } 또는 { ok: false, error: { code, message } }입니다. 임의 이벤트·room·namespace·Socket 객체를 업무에 공개하지 않습니다.

## 설정

SOCKET_IO_AUTO_START=true/false, SOCKET_IO_AUTH_TOKEN=선택 비밀값. 주소·포트·정확한 Origin 허용은 HTTP_HOST/HTTP_PORT/HTTP_ALLOWED_ORIGINS를 공유합니다. HTTP 자동 시작이 false이면 Socket.IO 자동 시작 true 조합을 거부합니다. 수동 start 전에 HTTP를 시작해야 합니다.

앱 루트 .env를 사용하고 OS 환경을 우선합니다. 실제 .env는 사용자가 작성하며 .env.example는 실행 설정으로 자동 로드하지 않습니다. 비밀값을 커밋하지 않습니다. Node/Main에서만 제공하며 정적 frontend/client를 추가하지 않습니다.

## 수명과 제한

Origin은 HTTP_ALLOWED_ORIGINS 목록과 정확히 일치해야 합니다. Origin 없는 client와 외부 bind는 ASCII 32~256자 토큰이 필수이고 handshake.auth.token으로만 전달합니다. 설정한 토큰은 Origin 있는 client도 제출해야 합니다. 최대 64개 연결·전역 진행 업무 64개·소켓당 진행 업무 1개, JSON 64 KiB·인증 대기 10초·업무/ack 30초·종료 유예 5초입니다. stop은 신규 접수를 막고 진행 요청을 정리한 뒤 자신의 연결과 Engine만 해제합니다. HTTP 리스너·Bridge·공유 Service는 유지하며 Socket.IO를 먼저 중단하기 전 HTTP stop은 거부합니다. Socket.IO가 사용한 keep-alive 연결은 중단 시 닫힐 수 있으므로 HTTP 요청은 별도 연결을 사용하세요.

start(config)·stop()·dispose()는 직렬화하고 같은 설정 start는 중복 자원을 만들지 않습니다. 설정 변경 전에 stop을 호출합니다. Bridge 등록/해제는 stopped에서만 가능하며 반환한 해제 함수는 중복 호출해도 안전합니다. 통신은 업무 Bridge를 import하지 않고 DI가 연결하며 Bridge는 payload를 검증해 Usecase를 호출합니다. 실패를 성공으로 바꾸지 않고 원래 오류는 내부 onError 콜백으로 전달하며 기본 로그에는 상세 비밀값을 출력하지 않습니다.

stop은 공유 Service를 해제하지 않고 dispose 뒤에는 start를 거부합니다. 시간 제한·종료는 업무 Promise의 강제 취소가 아니며 늦은 결과는 외부로 보내지 않습니다. 수신/브로커의 치명적 장애는 failure로 앱 종료에 전달합니다. 실제 연결·보안·부하 성공은 아직 검증하지 않았습니다.

검증 명령·선행 조건·기대 결과·실패 대응은 docs/validation/socketIoValidation.md를 따릅니다.

## DI에서 연결하기

다음은 import와 createDi 내부에 나누어 추가하는 부분 예시입니다. 업무 Bridge는 앱에서 준비합니다. HTTP를 먼저 생성·등록한 상태가 필요합니다. Socket.IO는 HTTP 뒤에 등록해 역순 종료되도록 합니다.

```ts
// 파일: src/backend/core/di.ts
// 추가 위치 1: 파일 상단의 기존 import 아래에 추가합니다.
import { createSocketIoCommunication } from '../communications/socketIo/socketIo.communication.ts';
import { readSocketIoConfig } from '../config/socketIo.config.ts';

// 추가 위치 2: createDi() 내부의 기존 features 생성 직후에 추가합니다.
// const features = createInitialFeatures(); 는 기존 코드를 유지하며 중복 추가하지 않습니다.
const socketIo = createSocketIoCommunication({ http: features.instances.http });
const socketIoConfig = readSocketIoConfig();
// 업무 Bridge를 구현한 경우 여기서 socketIo.registerBridge(bridge)를 호출합니다.
features.communicationEntries.push({
  name: 'socketIo', autoStart: true,
  start: () => socketIo.start(socketIoConfig),
  stop: () => socketIo.stop(),
  dispose: () => socketIo.dispose(),
  failure: socketIo.failure,
});
// 아래의 기존 return createRuntime(features, appEntries)는 유지합니다.
// 여기서 start()를 직접 호출하지 않습니다. 앱 진입점이 di.start()를 호출합니다.
```

자동 시작을 끈 통신은 di.start()만으로 열리지 않습니다. 앱 실행이 유지되는 작업 위치에서 해당 통신의 start(config)를 호출합니다. 설정은 src/backend/config의 readSocketIoConfig를 사용하고 실제 .env의 값을 읽도록 앱 시작 시 loadEnvironment()를 먼저 수행합니다. stop()은 통신 중단, dispose()는 재시작할 수 없는 최종 해제입니다. 업무 완료 또는 앱 종료 시 di.dispose()를 호출하며 통신을 중단했다고 공유 업무 Service를 별도로 해제하지 않습니다. 등록 해제 함수는 통신을 중단한 뒤 호출합니다.

수동 시작은 HTTP → Socket.IO 순서이며 중단은 Socket.IO → HTTP 역순입니다. 클라이언트는 호환되는 socket.io-client를 별도 준비해 request 이벤트로 `{ route, payload }`를 보내고 ack의 ok를 확인합니다. 토큰은 handshake auth.token으로 전달하며 URL에 넣지 않습니다.

## 적용 방식

Compose는 이 기능이 표준 구성의 필수 연결인 경우만 자동 포함합니다. 그 외에는 기능 원본의 files/에서 필요한 파일을 직접 복사하고 패키지·설정·앱 DI를 수동 연결합니다. feature add는 제공하지 않습니다. 추가 객체는 createDi 내부의 지역 변수로 만들고 필요한 Usecase·Service·Bridge의 생성자에 직접 전달합니다. 추가 기능을 사용하기 위해 DI 반환값의 instances 목록을 확장하거나 업무 코드에서 DI 전체를 조회하지 않습니다. 기능 매니페스트는 생성하지 않으며 di.ts를 직접 수정합니다.

```jsonc
// 파일: package.json
// 적용: 아래 항목을 기존 dependencies/devDependencies에 병합합니다.
// 실제 JSON에는 이 주석을 넣지 않습니다. 파일 전체를 대체하지 않습니다.
{
  "dependencies": {
    "socket.io": "4.8.4",
    "engine.io": "6.6.11"
  }
}
```. 필요한 항목만 앱 package.json에 반영합니다.

설정 키: `SOCKET_IO_AUTH_TOKEN`, `SOCKET_IO_AUTO_START`. 키의 설명·비밀값 구분은 아래 설정 절과 환경 양식을 확인합니다.

공통 수동 연결 절차는 Composer 원본 `components/03-features/README.md`에 있습니다.

### 수동 생성에 필요한 원본

- `src/backend/communications/socketIo/socketIo.communication.ts`의 `createSocketIoCommunication` 사용. 생성자/factory 의존성: `{"http": "http"}`. 수명 메서드: 통신 start·stop·dispose 또는 수명 없음.

### 패키지와 환경 양식

- package.json `dependencies`: `"socket.io": "4.8.4"`
- package.json `dependencies`: `"engine.io": "6.6.11"`

.env.example에 필요한 키만 직접 추가합니다. AUTO_START 키는 기본 생성기가 더 이상 읽지 않으므로 필요하면 앱 DI에서 readAutoStart로 직접 연결합니다.

```dotenv
# 파일: .env.example
# 적용: 필요한 키만 추가합니다. 실제 값은 사용자 .env 또는 OS 환경에 작성합니다.
# Origin 없는 client 또는 외부 bind 필수 ASCII 32~256자 토큰
SOCKET_IO_AUTH_TOKEN=
```

## package.json과 README 버전 기록

아래는 추가할 항목만 표시합니다. 같은 패키지가 있으면 중복 추가하지 말고 버전 호환성을 확인합니다. 실제 JSON에는 주석을 넣지 않습니다.

```jsonc
// 파일: package.json
// 적용: 기존 dependencies/devDependencies 객체에 아래 항목만 병합합니다.
// 파일 전체를 대체하지 않으며 기존 version과 scripts는 유지합니다.
{
  "dependencies": {
    "socket.io": "4.8.4",
    "engine.io": "6.6.11"
  }
}
```

```sh
# 실행 위치: 생성 앱 루트 터미널
# 적용: package.json 병합 후 실행하고 변경된 package-lock.json을 함께 관리합니다.
npm install --ignore-scripts --no-audit --no-fund
```

아래 기록을 앱 README에 추가합니다. 최초 원본 기준은 v0.0.0이며 앱에서 수정했다면 실제 변경 내용·적용일을 함께 기록합니다. 기능 원본 버전과 npm 패키지 버전, 앱 자체 버전은 별개입니다. 적용 여부가 불명확한 상태를 완료로 기록하지 않습니다.

```md
<!-- 파일: README.md -->
<!-- 적용: 기존 기능·의존성 관리 절의 표에 아래 행을 추가합니다. -->
<!-- 적용일·연결 파일은 앱의 실제 값으로 작성하고, 기존 표가 없으면 제목과 표를 함께 추가합니다. -->
## 수동 추가 기능과 버전

| 기능 | 원본 기준 | 사용 패키지 | 적용일 | 연결 위치 | 사용법 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| socket-io | Composer v0.0.0 | socket.io 4.8.4, engine.io 6.6.11 | YYYY-MM-DD | src/backend/core/di.ts | docs/socketIo.md |

<!-- 기능 코드를 앱에서 수정하면 아래 변경 기록도 실제 내용으로 추가합니다. -->
### 기능 변경 기록

- YYYY-MM-DD: socket-io — 추가 또는 수정한 내용, 실제 검사 결과와 미검증 범위
```

기능 추가만으로 package.json의 앱 version을 임의로 변경하지 않습니다. 앱 릴리스 정책에 따라 버전을 변경할 때 README 기록과 package-lock.json도 함께 맞춥니다. 실제 .env·키·토큰·로그·node_modules·dist는 저장하지 않습니다.

## Usecase 생성과 Bridge 연결 예시

아래는 문서에서만 사용하는 텍스트 처리 예시이며 기본 생성 코드에 포함하지 않습니다. 앞의 DI 연결 절에서 생성한 통신 객체를 재사용합니다. Usecase는 통신 객체나 DI 전체를 받지 않습니다.

```ts
// 파일: src/backend/usecases/text/normalizeText.usecase.ts
// 적용: 문서 예시용 새 파일 전체입니다. 실제 업무 이름과 검증 규칙으로 바꿉니다.
export class NormalizeTextUsecase {
  execute(payload: unknown): { text: string } {
    if (!payload || typeof payload !== 'object' || !('text' in payload)
      || typeof payload.text !== 'string' || payload.text.length > 1000) {
      throw new Error('Invalid text payload');
    }
    return { text: payload.text.trim() };
  }
}
```
```ts
// 파일: src/backend/bridge/text/text.socketIo.bridge.ts
// 적용: 새 파일 전체입니다. Usecase는 생성자로 전달한 의존성에 해당합니다.
import type { SocketIoBridge } from '../../communications/socketIo/socketIo.contract.ts';
import type { NormalizeTextUsecase } from '../../usecases/text/normalizeText.usecase.ts';

export function createTextSocketIoBridge(usecase: NormalizeTextUsecase): SocketIoBridge {
  return { name: 'normalizeText', handle: payload => usecase.execute(payload) };
}
```
```ts
// 파일: src/backend/core/di.ts
// 추가 위치 1: 파일 상단 import에 추가합니다.
import { NormalizeTextUsecase } from '../usecases/text/normalizeText.usecase.ts';
import { createTextSocketIoBridge } from '../bridge/text/text.socketIo.bridge.ts';

// 추가 위치 2: createDi 내부에서 통신 객체 생성 후, runtime 반환 전에 추가합니다.
const normalizeText = new NormalizeTextUsecase();
socketIo.registerBridge(createTextSocketIoBridge(normalizeText));
// Usecase에 수명이 없으므로 빈 initialize/dispose를 등록하지 않습니다.
```
