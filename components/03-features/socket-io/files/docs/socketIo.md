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

아래 코드는 앱별 DI 조립 위치에 넣는 구조 예시입니다. `di`는 createDi()의 반환값이며 예시의 `bridge`는 앱이 구현한 업무 Bridge입니다. 생성 매니페스트를 직접 편집하지 않습니다. DI에서 같은 Usecase 인스턴스를 필요한 Bridge에 주입하고 통신 시작 전에 등록합니다. 외부 payload의 실제 검증은 업무 Bridge/Service가 담당합니다.

```ts
di.instances.socketIo.registerBridge(bridge);
// bridge: { name, handle(payload) } — name이 request의 route입니다.
await di.start();
```

자동 시작을 끈 통신은 di.start()만으로 열리지 않습니다. 앱 실행이 유지되는 작업 위치에서 해당 통신의 start(config)를 호출합니다. 설정은 src/backend/config의 readSocketIoConfig를 사용하고 실제 .env의 값을 읽도록 앱 시작 시 loadEnvironment()를 먼저 수행합니다. stop()은 통신 중단, dispose()는 재시작할 수 없는 최종 해제입니다. 업무 완료 또는 앱 종료 시 di.dispose()를 호출하며 통신을 중단했다고 공유 업무 Service를 별도로 해제하지 않습니다. 등록 해제 함수는 통신을 중단한 뒤 호출합니다.

수동 시작은 HTTP → Socket.IO 순서이며 중단은 Socket.IO → HTTP 역순입니다. 클라이언트는 호환되는 socket.io-client를 별도 준비해 request 이벤트로 `{ route, payload }`를 보내고 ack의 ok를 확인합니다. 토큰은 handshake auth.token으로 전달하며 URL에 넣지 않습니다.
