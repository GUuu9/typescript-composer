# TCP 서버

TCP는 Node 기본 net 기반의 수신 서버입니다. 선택한 Node backend·Electron Main에만 포함하며 frontend는 TCP에 직접 접근하지 않습니다. HTTP·IPC와 함께 사용할 수 있지만 TCP는 독립 서버와 포트를 소유합니다. 발신 전용 client·자동 재연결·broadcast·TLS는 제공하지 않습니다.

## 설정

앱 루트 .env를 사용하고 OS 환경 변수를 우선합니다. 선택한 키의 양식은 .env.example이며 실제 값은 Git·state·로그에 저장하지 않습니다.

| 키 | 기본값·제약 |
| :--- | :--- |
| TCP_HOST | 127.0.0.1. IP 또는 localhost |
| TCP_PORT | 4000. 환경 값은 1~65535 정수 |
| TCP_AUTO_START | 생성 시 선택. true/false로 재정의 |
| TCP_AUTH_TOKEN | 선택 비밀값. 공백 없는 인쇄 가능한 ASCII 32~256자. loopback 외 bind 시 필수 |

토큰을 설정하면 loopback에서도 인증해야 합니다. 서버는 평문 TCP이므로 토큰이 암호화를 제공하지 않습니다. 외부 bind는 신뢰할 수 있는 망에서 사용하고 인터넷용 TLS·사용자별 인증은 별도로 설계합니다. 설정 변경은 앱 재시작 또는 stop → 새 설정의 start 순서입니다. 직접 start 설정의 port=0은 임시 포트 검증용이며 환경 값에는 허용하지 않습니다.

## 전송

4-byte unsigned big-endian 본문 길이 뒤에 UTF-8 JSON 본문을 보냅니다. 본문은 1~65536 byte이며 잘못된 길이는 본문 할당 전에 거부합니다. JSON 한 줄을 그대로 보내는 프로토콜이 아닙니다. 분할·병합 수신과 half-close를 처리합니다. UTF-8 오류·잘린 frame·부적합 JSON 값을 거부합니다.

- 인증 첫 frame: `{ "type": "auth", "token": "사용자가 설정한 비밀값" }`. 성공은 `{ "type": "auth", "ok": true }`입니다. 인증 실패·인증 전 업무 요청은 unauthorized 오류 후 연결 종료입니다.
- 업무 요청: `{ "type": "request", "id": "request1", "route": "featureName", "payload": null }`. id는 영문·숫자·밑줄·하이픈 1~64자, route는 camelCase Bridge 이름이며 누락·추가 필드는 거부합니다.
- 성공: `{ "type": "response", "id": "request1", "ok": true, "data": null }`.
- 오류: `{ "type": "response", "id": "request1", "ok": false, "error": { "code": "notFound", "message": "Not found" } }`.

신뢰할 수 없는 id는 null이며 framing·인증 오류는 연결을 닫습니다. 전송이 안전하지 않으면 오류 frame 없이 닫을 수 있습니다. 미등록 route는 notFound, 형식 오류는 invalidRequest, 초과 입력은 payloadTooLarge, 업무 예외·부적합 결과는 internalError, 업무 시간 초과는 requestTimeout입니다. 응답 envelope 전체도 64 KiB 이하입니다. 순환·undefined·bigint·비유한 수·접근자 등 JSON 값이 아닌 결과를 성공으로 바꾸지 않습니다.

## 등록과 수명

메인 DI에서 TcpBridge의 고유 name·handle(payload)을 registerBridge에 전달합니다. 반환 함수로 중단 상태에서 해제합니다. 기본 앱에는 업무 Bridge가 없으므로 미등록 route에 가짜 성공을 반환하지 않습니다. Bridge가 업무 payload를 검증하고 Usecase를 호출하며, 통신이 업무 객체를 import하거나 Socket을 shared/Usecase에 넘기지 않습니다.

start는 필수 Service 초기화 후 listen합니다. 생성자·수동 대기 상태에서는 소켓이나 타이머를 열지 않습니다. 같은 설정 start는 중복 서버를 만들지 않고 다른 설정은 stop을 먼저 요구합니다. stop은 Bridge·업무 객체를 유지한 네트워크 중단이며 dispose는 최종 해제입니다.

최대 64연결이며 연결별 요청을 순차 처리하고 응답 쓰기를 기다립니다. 인증 10초·frame 첫 byte부터 수신 30초·업무 30초·응답 쓰기 30초·대기 연결 60초를 제한합니다. stop은 새 접수를 차단하고 대기 연결을 닫은 뒤 진행 요청을 최대 5초 기다립니다. 초과 시 소켓을 정리하고 오류를 반환하지만 정리가 끝나면 재시작할 수 있습니다. 소켓 종료는 업무 Promise의 강제 취소가 아닙니다.

개별 연결 오류는 그 연결만 정리합니다. 수신 서버의 치명적 오류는 failure Promise로 앱 수명 관리자에 전달해 자원을 정리하고 실패 종료합니다. 초기 listen 실패는 start의 오류로 전달하며 필요 시 시작 실패가 다른 통신을 임의 중단하지 않습니다. 공개 응답과 기본 로그는 원문·내부 경로·스택·비밀값을 숨깁니다. 내부 onError 콜백에는 원래 오류가 전달되므로 사용자 진단 코드도 비밀값을 노출하지 않도록 작성합니다.

## 검사

기본 확인은 설정·프레임 단위 검사만 수행합니다. 별도 npm script 등록은 필요하지 않습니다.

```sh
# 실행 위치: TCP 소스와 테스트를 복사한 새 임시 앱 루트 터미널
# 목적: 실제 연결 없이 설정·인증 조건·프레임 경계만 확인합니다.
node --test --test-name-pattern="^TCP (validates|framing)" test/backend/tcp.test.ts
```

실제 단절·종료 문제가 보고된 경우에만 해당 이름의 loopback 또는 slow: 검사를 별도 선택합니다. 전체 check/test/build를 이 파트 검사마다 반복하지 않습니다.

사용 전 명령·선행 조건·기대 결과·미검증 항목은 [TCP 검증 절차](validation/tcpValidation.md)를 따릅니다. 에이전트는 이 절차를 자동 실행하지 않습니다.

## DI에서 연결하기

다음은 import와 createDi 내부에 나누어 추가하는 부분 예시입니다. 업무 Bridge는 앱에서 준비합니다.

```ts
// 파일: src/backend/core/di.ts
// 추가 위치 1: 파일 상단의 기존 import 아래에 추가합니다.
import { createTcpCommunication } from '../communications/tcp/tcp.communication.ts';
import { readTcpConfig } from '../config/tcp.config.ts';

// 추가 위치 2: createDi() 내부의 기존 features 생성 직후에 추가합니다.
// const features = createInitialFeatures(); 는 기존 코드를 유지하며 중복 추가하지 않습니다.
const tcp = createTcpCommunication({});
const tcpConfig = readTcpConfig();
// 업무 Bridge를 구현한 경우 여기서 tcp.registerBridge(bridge)를 호출합니다.
features.communicationEntries.push({
  name: 'tcp', autoStart: true,
  start: () => tcp.start(tcpConfig),
  stop: () => tcp.stop(),
  dispose: () => tcp.dispose(),
  failure: tcp.failure,
});
// 아래의 기존 return createRuntime(features, appEntries)는 유지합니다.
// 여기서 start()를 직접 호출하지 않습니다. 앱 진입점이 di.start()를 호출합니다.
```

자동 시작을 끈 통신은 di.start()만으로 열리지 않습니다. 앱 실행이 유지되는 작업 위치에서 해당 통신의 start(config)를 호출합니다. 설정은 src/backend/config의 readTcpConfig를 사용하고 실제 .env의 값을 읽도록 앱 시작 시 loadEnvironment()를 먼저 수행합니다. stop()은 통신 중단, dispose()는 재시작할 수 없는 최종 해제입니다. 업무 완료 또는 앱 종료 시 di.dispose()를 호출하며 통신을 중단했다고 공유 업무 Service를 별도로 해제하지 않습니다. 등록 해제 함수는 통신을 중단한 뒤 호출합니다.

클라이언트는 JSON 본문 앞에 본문 바이트 수의 4-byte big-endian 길이를 붙입니다. 요청은 `{ type: "request", id: "one", route: "status", payload: null }`입니다. 토큰이 필요하면 먼저 `{ type: "auth", token }` 프레임을 보내 인증 성공을 확인합니다. 요청 id와 응답 id를 대응시키고 ok가 false이면 error.code를 처리합니다. 실제 진행 업무 64개를 넘으면 busy이며 연결 종료는 업무 취소가 아닙니다.

## 적용 방식

Compose는 이 기능이 표준 구성의 필수 연결인 경우만 자동 포함합니다. 그 외에는 기능 원본의 files/에서 필요한 파일을 직접 복사하고 패키지·설정·앱 DI를 수동 연결합니다. feature add는 제공하지 않습니다. 추가 객체는 createDi 내부의 지역 변수로 만들고 필요한 Usecase·Service·Bridge의 생성자에 직접 전달합니다. 추가 기능을 사용하기 위해 DI 반환값의 instances 목록을 확장하거나 업무 코드에서 DI 전체를 조회하지 않습니다. 기능 매니페스트는 생성하지 않으며 di.ts를 직접 수정합니다.

추가 외부 패키지는 없습니다. 기본 구성의 런타임과 공통 코드를 사용합니다.

설정 키: `TCP_HOST`, `TCP_PORT`, `TCP_AUTO_START`, `TCP_AUTH_TOKEN`. 키의 설명·비밀값 구분은 아래 설정 절과 환경 양식을 확인합니다.

공통 수동 연결 절차는 Composer 원본 `components/03-features/README.md`에 있습니다.

### 수동 생성에 필요한 원본

- `src/backend/communications/tcp/tcp.communication.ts`의 `createTcpCommunication` 사용. 생성자/factory 의존성: `{}`. 수명 메서드: 통신 start·stop·dispose 또는 수명 없음.

### 패키지와 환경 양식

추가 외부 패키지는 없습니다. Node 기본 API와 복사한 공통 코드를 사용합니다.

.env.example에 필요한 키만 직접 추가합니다. AUTO_START 키는 기본 생성기가 더 이상 읽지 않으므로 필요하면 앱 DI에서 readAutoStart로 직접 연결합니다.

```dotenv
# 파일: .env.example
# 적용: 필요한 키만 추가합니다. 실제 값은 사용자 .env 또는 OS 환경에 작성합니다.
# IP 또는 localhost. 기본 127.0.0.1
TCP_HOST=
# 1~65535 정수. 기본 4000
TCP_PORT=
# 공백 없는 ASCII 32~256자. loopback 외 bind 필수, 평문 TCP 인증 비밀값
TCP_AUTH_TOKEN=
```

## package.json과 README 버전 기록

이 기능만을 위해 package.json에 추가할 패키지는 없습니다. 빈 dependencies 항목이나 버전·명령을 임의로 추가하지 않습니다. 소스 복사만 했다면 패키지 설치 명령도 필요하지 않습니다.

아래 기록을 앱 README에 추가합니다. 최초 원본 기준은 v0.0.0이며 앱에서 수정했다면 실제 변경 내용·적용일을 함께 기록합니다. 기능 원본 버전과 npm 패키지 버전, 앱 자체 버전은 별개입니다. 적용 여부가 불명확한 상태를 완료로 기록하지 않습니다.

```md
<!-- 파일: README.md -->
<!-- 적용: 기존 기능·의존성 관리 절의 표에 아래 행을 추가합니다. -->
<!-- 적용일·연결 파일은 앱의 실제 값으로 작성하고, 기존 표가 없으면 제목과 표를 함께 추가합니다. -->
## 수동 추가 기능과 버전

| 기능 | 원본 기준 | 사용 패키지 | 적용일 | 연결 위치 | 사용법 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| tcp | Composer v0.0.0 | 추가 패키지 없음 | YYYY-MM-DD | src/backend/core/di.ts | docs/tcp.md |

<!-- 기능 코드를 앱에서 수정하면 아래 변경 기록도 실제 내용으로 추가합니다. -->
### 기능 변경 기록

- YYYY-MM-DD: tcp — 추가 또는 수정한 내용, 실제 검사 결과와 미검증 범위
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
// 파일: src/backend/bridge/text/text.tcp.bridge.ts
// 적용: 새 파일 전체입니다. Usecase는 생성자로 전달한 의존성에 해당합니다.
import type { TcpBridge } from '../../communications/tcp/tcp.contract.ts';
import type { NormalizeTextUsecase } from '../../usecases/text/normalizeText.usecase.ts';

export function createTextTcpBridge(usecase: NormalizeTextUsecase): TcpBridge {
  return { name: 'normalizeText', handle: payload => usecase.execute(payload) };
}
```
```ts
// 파일: src/backend/core/di.ts
// 추가 위치 1: 파일 상단 import에 추가합니다.
import { NormalizeTextUsecase } from '../usecases/text/normalizeText.usecase.ts';
import { createTextTcpBridge } from '../bridge/text/text.tcp.bridge.ts';

// 추가 위치 2: createDi 내부에서 통신 객체 생성 후, runtime 반환 전에 추가합니다.
const normalizeText = new NormalizeTextUsecase();
tcp.registerBridge(createTextTcpBridge(normalizeText));
// Usecase에 수명이 없으므로 빈 initialize/dispose를 등록하지 않습니다.
```
