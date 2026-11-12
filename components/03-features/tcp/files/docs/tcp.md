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

npm run check·npm test·npm run build는 선택한 영역을 검사합니다. 기본 test/verify는 slow: 검사를 제외합니다. 실제 5초 종료 제한은 별도 터미널의 `npm run test:tcp:slow`로 확인합니다. 이 명령은 TCP를 선택한 앱에만 있습니다. 실제 외부 연결·부하·Electron GUI·모든 제한시간 검증과 기본 단위/loopback 검사를 구분합니다.

사용 전 명령·선행 조건·기대 결과·미검증 항목은 [TCP 검증 절차](validation/tcpValidation.md)를 따릅니다. 에이전트는 이 절차를 자동 실행하지 않습니다.

## DI에서 연결하기

아래 코드는 앱별 DI 조립 위치에 넣는 구조 예시입니다. `di`는 createDi()의 반환값이며 예시의 `bridge`는 앱이 구현한 업무 Bridge입니다. 생성 매니페스트를 직접 편집하지 않습니다. DI에서 같은 Usecase 인스턴스를 필요한 Bridge에 주입하고 통신 시작 전에 등록합니다. 외부 payload의 실제 검증은 업무 Bridge/Service가 담당합니다.

```ts
di.instances.tcp.registerBridge(bridge);
// bridge: { name, handle(payload) } — name이 요청 route입니다.
await di.start();
```

자동 시작을 끈 통신은 di.start()만으로 열리지 않습니다. 앱 실행이 유지되는 작업 위치에서 해당 통신의 start(config)를 호출합니다. 설정은 src/backend/config의 readTcpConfig를 사용하고 실제 .env의 값을 읽도록 앱 시작 시 loadEnvironment()를 먼저 수행합니다. stop()은 통신 중단, dispose()는 재시작할 수 없는 최종 해제입니다. 업무 완료 또는 앱 종료 시 di.dispose()를 호출하며 통신을 중단했다고 공유 업무 Service를 별도로 해제하지 않습니다. 등록 해제 함수는 통신을 중단한 뒤 호출합니다.

클라이언트는 JSON 본문 앞에 본문 바이트 수의 4-byte big-endian 길이를 붙입니다. 요청은 `{ type: "request", id: "one", route: "status", payload: null }`입니다. 토큰이 필요하면 먼저 `{ type: "auth", token }` 프레임을 보내 인증 성공을 확인합니다. 요청 id와 응답 id를 대응시키고 ok가 false이면 error.code를 처리합니다. 실제 진행 업무 64개를 넘으면 busy이며 연결 종료는 업무 취소가 아닙니다.
