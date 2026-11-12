<!-- version: v0.0.0 -->
# HTTP 구현 계약

상태: 사용자 요청에 따라 Express·.env 방식으로 구현했습니다. Node HTTP 생성·실행·요청 및 종료 검증을 완료했으며 웹 통합·Electron 재사용도 추가했으며 Electron 실제 실행은 별도 검증 대상입니다. 기존 공통 조립 계약과 수명 규칙을 전제로 합니다.

## 범위와 원본

첫 지원은 typescript-backend + HTTP입니다. None은 그대로 유지합니다. 업무 API·인증 예제·저장·정적 웹·CORS 허용 기능은 기본 생성에 넣지 않습니다. backend-webui·Electron 결합은 다음 단계에서 이 통신 구현을 재사용합니다.

- Express는 라우팅·JSON 본문·공개 오류 응답을 담당합니다. Node HTTP Server는 listen·연결 추적·종료를 담당합니다. Express 5.3.0·@types/express 5.0.6은 공식 npm 레지스트리에서 확인한 정확한 버전으로 고정했습니다.
- `components/03-features/http`에 통신·설정·해당 테스트와 compose.json을 둡니다. 처음부터 선택 통신으로 포함하고 사후 추가 명령은 아직 제공하지 않습니다.
- `02-targets`는 웹 통합 제공·Electron 연결처럼 base 연결 파일 교체가 필요한 차이에 사용합니다. HTTP 선택 자체는 생성 매니페스트의 통신 등록으로 연결하며 사용자 DI를 문자열로 고치지 않습니다.
- Node base의 진입점과 DI에는 통신 목록 0개·복수의 공통 시작·종료 지점을 처음부터 넣습니다. 이 변경은 앞으로 생성할 앱의 원본에만 적용하며 이미 생성한 앱은 수정하지 않습니다.

## 파일·식별자

| 앱 파일 | 식별자·책임 |
| :--- | :--- |
| backend/communications/http/http.communication.ts | HttpCommunication·createHttpCommunication. Express와 HTTP 서버의 단일 소유자 |
| backend/communications/http/http.contract.ts | HttpConfig·HttpBridge·통신 상태 및 등록 계약. backend 내부 타입이며 shared에 두지 않음 |
| backend/config/http.config.ts | readHttpConfig. 환경 변수의 공개 설정을 읽고 검증 |
| test/backend/http.test.ts | 실제 loopback의 임시 포트로 시작·요청·중단·재시작·오류·제한 검사 |
| docs/http.md | 설정·등록·실행·요청 제한·종료 정책 |

설정은 HTTP_HOST(기본 127.0.0.1)·HTTP_PORT(기본 3000)·HTTP_AUTO_START로 시작합니다. 앱은 DI 생성 전에 앱 루트의 .env를 읽으며 이미 지정된 OS 환경 변수는 덮어쓰지 않습니다. .env는 사용자가 .env.example를 복사해 작성하고 실제 값은 Git·state·로그에 저장하지 않습니다. .env가 없어도 기본값·OS 환경 변수로 실행할 수 있으며 읽기 실패는 안전한 오류로 중단합니다. 테스트의 직접 설정은 포트 0을 허용합니다. 환경 변수의 포트는 정수 1~65535, host는 IP 주소 또는 localhost만 허용합니다. 잘못된 값은 실제 listen 전에 거부합니다. 외부 인터페이스 바인딩은 명시적인 host 설정으로만 수행합니다.

## 공통 .env 규칙

Node backend·Electron Main의 선택된 통신은 앱 루트의 .env를 공통으로 사용합니다. 통신별 키를 HTTP_·TCP_·UDP_·MQTT_·SOCKET_IO_처럼 구분하고 실제 키는 각 통신 구현 시 선언합니다. HTTP 외 프로토콜의 예시 키나 미구현 설정은 현재 .env.example에 넣지 않습니다. 미선택 통신은 .env에 키를 추가해도 설치·등록·활성화되지 않습니다.

compose.json의 environment 선언에서 선택된 키·필수 여부·비밀값 여부·설명을 모아 .env.example를 생성합니다. 비밀값은 빈 값만 제공하며 자동 추가 시에는 새 키만 병합하고 사용자의 기존 실제 .env는 읽어 재작성하지 않습니다. 접속·인증·제한값은 프로토콜별 config에서 실제 사용 전에 검증하고 오류에는 키 이름·요구 형식만 표시합니다.

.env는 시작 시 한 번 읽으며 수정 후 앱을 재시작합니다. 중단 중 환경 값의 자동 재로딩·감시·실행 중 설정 변이는 제공하지 않습니다. 수동 start(config)의 새 설정 적용은 기존 stop → 검증 → start 계약을 유지합니다. backend/Main에서 .env를 읽으며 브라우저로 전달하는 값은 별도 허용된 공개 설정만 사용합니다. 브라우저가 서버 비밀값이나 전체 환경 변수를 받지 않도록 다음 웹 구현 단계에 연결합니다.

## 통신 객체

- `start(config): Promise<void>`, `stop(): Promise<void>`, `dispose(): Promise<void>`와 읽기 전용 `state`·`address`를 제공합니다. address는 listen 성공 후 실제 host·port이며 중단 후 null입니다.
- 상태는 stopped·starting·running·stopping·disposed입니다. 생성자는 소켓·리스너·타이머를 열지 않습니다. 정규화한 동일 설정 start는 중복 연결 없이 완료하고 다른 설정은 stop을 먼저 요구합니다.
- start/stop/dispose는 호출 순서대로 조정합니다. dispose 요청 후 새 start·Bridge 변경은 즉시 거부하고 진행 중 start가 성공하더라도 정리 후 최종 disposed가 됩니다. 중복 중단·해제는 자원을 다시 해제하지 않습니다.
- listen 실패는 시도에서 연 서버·소켓·이벤트를 정리하고 원래 오류를 보존해 전달합니다. 자동 재연결·이전 설정 복원은 하지 않습니다.
- stop은 Bridge 정의와 공유 업무 객체를 유지하고 네트워크 자원만 닫습니다. 다음 start는 새 서버에 같은 Bridge 정의를 연결합니다. dispose는 최종 종료이며 Bridge 정의도 해제합니다.

## Bridge 등록과 요청 처리

`registerBridge(bridge): () => void`를 제공합니다. HttpBridge는 고유 camelCase `name`과 `register(router): void | Promise<void>`를 가지며, 각 Bridge는 자신의 Express Router에 허용 경로·메서드를 등록합니다. 반환 함수는 등록 해제이며 중복 호출은 안전합니다. 등록·해제는 stopped 상태에서만 허용하고 같은 이름의 중복은 거부합니다. 통신은 업무 Bridge를 import하지 않으며 DI가 객체를 전달합니다.

Router는 내부 전송 어댑터이며 Node·Express 객체를 shared 계약이나 Usecase 입력으로 전달하지 않습니다. 각 업무 Bridge가 payload를 검증하고 Usecase를 호출합니다. 기본 생성에는 업무 Bridge를 만들지 않고 테스트 fixture에서만 확인합니다.

| 항목 | 정책 |
| :--- | :--- |
| 미등록 경로 | 404 JSON: error.code = notFound, error.message = Not found |
| 잘못된 JSON | 400 JSON: invalidRequest / Invalid request |
| 너무 큰 본문 | 413 JSON: payloadTooLarge / Payload too large |
| 금지 Origin | 403 JSON: forbiddenOrigin / Origin not allowed |
| 업무·미처리 예외 | 500 JSON: internalError / Internal server error. 원본 오류는 내부 보고 콜백에 전달하고 응답에는 경로·스택·원문을 넣지 않음 |
| 잘못된 HTTP framing·헤더 | Node 파서에서 400 또는 431 후 연결 종료. JSON 응답을 보장하지 않음 |
| 응답 도중 오류 | 이미 헤더를 보냈다면 오류 JSON을 덧붙이지 않고 연결 종료 |

성공 응답 형식은 업무 Bridge가 결정하며 아직 업무 envelope를 추가하지 않습니다. Express의 x-powered-by는 비활성화하고 기본 오류 페이지를 노출하지 않습니다. JSON parser 오류는 전송 경계에서만 변환하고 원본 오류는 cause 또는 내부 보고 콜백으로 보존합니다. 잘못된 본문에 사용자 원문을 포함한 진단을 기본 콘솔에 출력하지 않습니다.

## 요청 제한과 Origin

첫 구현은 HTTP/1.1의 유한 JSON 요청/응답을 대상으로 합니다. 파일 업로드·스트리밍·WebSocket upgrade·TLS는 아직 지원하지 않습니다. 모든 메서드에서 실제 수신 본문을 최대 64 KiB로 제한하고, JSON parser의 제한만으로 다른 Content-Type의 본문이 무제한 통과하지 않도록 검사합니다. JSON 외 본문은 기본으로 허용하지 않으며 비어 있지 않으면 415 unsupportedMediaType으로 응답합니다. 헤더는 최대 16 KiB, 헤더 수신 10초·전체 본문 수신 30초·요청 처리 30초를 제한합니다. 요청 시간 초과는 가능한 경우 408 후 연결 종료하며 이미 응답을 시작했다면 연결만 종료합니다.

HTTP_ALLOWED_ORIGINS에 정확한 HTTP(S) origin을 쉼표로 지정할 수 있습니다. wildcard·null·계정·query·fragment는 거부하고 값이 비어 있으면 기존 동일 origin 정책을 유지합니다. 허용 응답은 해당 origin과 Vary: Origin을 포함하며 credential은 허용하지 않습니다. preflight는 GET/HEAD/POST/PUT/PATCH/DELETE/OPTIONS와 Accept/Content-Type만 허용합니다.

Origin이 없는 요청은 허용합니다. Origin이 있으면 요청 Host 기준 동일 origin만 허용하고, null·잘못된 형식·다른 origin은 거부합니다. Host는 올바른 단일 host:port인지 검증합니다. Origin 검사는 브라우저 요청의 보조 경계이며 인증이나 Host 기반 접근 통제를 대신하지 않습니다. 외부 브라우저의 분리 배포는 명시된 추가 origin만 허용합니다. CORS wildcard나 credential 허용을 기본으로 넣지 않습니다.

## 요청 정리와 종료

stop은 신규 접수 중단 → 이미 접수한 요청 완료 대기 → 연결·서버 해제 순서입니다. 종료 유예 기본값은 5초이며 진행 요청이 남으면 해당 소켓을 강제로 닫습니다. 유예 초과는 안전한 오류로 호출자에게 전달하되 소켓 정리가 끝난 경우 상태는 stopped로 유지하고 재시작을 허용합니다. 정리 자체에 실패하면 stopped로 표시하지 않고 오류를 전달합니다. 미응답·지연 핸들러에 대한 결과 전송은 차단하지만 강제 소켓 종료를 업무 Promise의 자동 취소로 설명하지 않습니다.

앱 종료는 모든 통신 stop/dispose를 시도하고 오류가 있어도 나머지 통신·공유 자원을 끝까지 정리합니다. 초기화·start의 원래 오류와 정리 오류는 AggregateError로 보존합니다. 자동 시작 HTTP의 실패는 앱 시작 실패이며 다른 시작된 통신·Service도 정리합니다. 수동 start 실패는 해당 HTTP만 정리합니다. 서비스가 모두 준비되기 전에 HTTP를 listen하지 않습니다.

## compose.json 등록 확장

기존 registrations는 객체 생성·업무 수명 등록을 유지합니다. 통신 객체에는 빈 initialize를 강제하지 않으며 일반 Service 초기화에 start를 섞지 않습니다.

추가 필드 `communications`는 다음 항목의 배열입니다.

| 필드 | 의미 |
| :--- | :--- |
| registration | 같은 영역 registrations의 객체 name. start·stop·dispose 구현을 타입 검사 |
| area | backend 또는 frontend. 이번 구현은 backend만 지원 |
| configModule | files/ 안의 앱 상대 설정 모듈 경로 |
| configFactory | 인자 없는 동기 설정 factory export. start에 넘길 설정 반환 |
| protocol | 정규화된 선택과 연결할 공개 프로토콜 id. 이번에는 http |

통신 포함 여부는 생성 선택을 기준으로 고정합니다. 선택된 선택 통신의 자동 시작은 구성 선택의 autoStart를 기본값으로 하고 .env의 <PROTOCOL>_AUTO_START로 재정의할 수 있습니다. 값은 true·false만 허용하며, 필수 통신의 false는 시작 전에 거부합니다. 구성 state에는 생성 시 기본 선택만 기록하고 실제 환경 값은 저장하지 않습니다. 중복 통신 등록·없는 객체·영역 불일치·설정 모듈/함수 누락을 계획 또는 타입 검사에서 거부합니다. 같은 객체를 일반 수명 dispose와 통신 dispose에 중복 등록하지 않습니다. factory는 객체만 생성하고 설정 검증은 자동 시작 대상은 DI 객체 생성 전에, 수동 시작 대상은 해당 start 직전에 수행합니다.

생성 매니페스트의 `createFeatures()` 반환값에 `communicationEntries`를 추가합니다. 각 항목은 name·autoStart와 설정이 연결된 start·stop·dispose 호출을 제공하며, instances의 객체와 동일한 인스턴스를 사용합니다. None에서는 빈 배열입니다. 메인 DI와 진입점의 고정 호출 지점이 이 배열을 사용해 초기화 이후 시작하고 업무 자원보다 먼저 통신을 정리합니다. 이 확장에 필요한 스키마·생성 코드·base·state·테스트를 함께 변경합니다.

대화형에서는 HTTP 선택 시 자동 시작 여부를 질문한 뒤 기능·프로젝트 이름을 받습니다. 이 답변은 HTTP_AUTO_START가 없을 때의 기본값이며 실제 운영 설정은 .env에서 조정합니다. 기본은 자동 시작이며 수동 선택은 리스너 없이 대기하는 통신 객체를 준비합니다. Node 단독의 수동 통신 외 다른 유지 자원이 없다면 None과 마찬가지로 정상 종료하며, 가짜 대기 루프를 만들지 않습니다. 내부 입력은 `autoStart: { http: boolean }`을 선택적으로 받아 같은 검증을 사용하고 필수 HTTP를 갖는 backend-webui에서는 false를 거부하도록 확장합니다.

## 완료 검사와 후속 단계

1. None 회귀, HTTP 선택·자동/수동 시작 정규화, 선언·등록·설정 충돌 및 누락 검사.
2. 실제 loopback 시작·기본 404·테스트 Bridge 등록/해제·재시작, 중복 start/stop/dispose·설정 변경 거부·최종 해제 후 start 거부.
3. 포트 점유 시작 실패·자원 정리, initialize 중 종료·start 중 dispose·중복 종료, 공유 Service 유지.
4. JSON·크기·Content-Type·Origin·헤더·시간 제한, 내부 오류 비노출, 정상 요청 정리·유예 초과 강제 종료와 재시작.
5. 임시 새 앱의 생성·Git init·install/check/test/build·빌드 결과 404·개발 재시작·Ctrl+C 뒤 포트/프로세스 해제.

실행 환경에서 bind·감시가 제한되면 샌드박스 밖 검증이 필요함을 구분해 기록합니다. 기존 project/는 어떤 검사에도 사용하지 않습니다. HTTP 구현·검증을 마친 뒤 React 단독과 backend-webui로 진행하며 다음 단계의 새 계약만 별도로 확인합니다.

## 근거

- Express 오류 처리: https://expressjs.com/en/guide/error-handling.html
- Express API·본문 제한: https://expressjs.com/en/5x/api.html
- Express 종료 원칙: https://expressjs.com/en/advanced/healthcheck-graceful-shutdown.html
- Node HTTP 연결 종료·시간 제한: https://nodejs.org/docs/latest-v24.x/api/http.html

## Socket.IO 부착

[통신 확장 계약](communication-expansion-contract.md)에 따라 HttpTransportHost는 실행 중 설정의 복사본과 경로 handler 부착/해제만 제공합니다. Socket.IO의 /socket.io/ polling·upgrade는 별도 handler로 보내고 나머지 요청·업그레이드 거부는 기존 동작을 유지합니다. 부착 중 HTTP stop은 거부하고 앱 종료는 Socket.IO → HTTP 역순으로 수행합니다. Socket.IO는 공유 HTTP 서버를 소유하거나 닫지 않습니다. 부착 계약·기존 HTTP 회귀·실제 Socket.IO 연결은 사용자 검증 대상으로 남깁니다.

실행 중 HTTP 서버 error는 failure Promise를 통해 앱 수명 관리자에 전달합니다. logger의 onError 기록과 별개이며 다른 통신과 자원을 정리한 뒤 실패 종료합니다. 정상 stop은 failure를 발생시키지 않습니다.
