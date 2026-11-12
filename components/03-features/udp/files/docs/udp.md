# UDP 통신

Node dgram unicast. datagram은 UTF-8 JSON { route, payload, token? }이며 최대 1200 bytes입니다. registerBridge({ name, handle(payload, peer) })로 연결하며 send({ address, port }, message)는 OS 전송 완료만 뜻합니다. 자동 응답·재전송·분할·broadcast·multicast는 없습니다.

## 설정

UDP_HOST=127.0.0.1, UDP_PORT=4001, UDP_ALLOWED_PEERS=정확한 IP 쉼표 목록, UDP_AUTH_TOKEN=선택 비밀값, UDP_AUTO_START=true/false. 빈 peer 목록은 loopback만 허용하고 외부 bind에는 peer 목록과 ASCII 32~256자 토큰이 필수입니다.

앱 루트 .env를 사용하고 OS 환경을 우선합니다. 실제 .env는 사용자가 작성하며 .env.example는 실행 설정으로 자동 로드하지 않습니다. 비밀값을 커밋하지 않습니다. Node/Main에서만 제공하며 정적 frontend/client를 추가하지 않습니다.

## 수명과 제한

수신 16개·송신 16개를 넘는 수신은 보고 후 버리며 송신은 실패합니다. 업무 제한 30초·종료 유예 5초이며 실제 업무가 끝날 때까지 자리를 유지합니다. 잘못된 UTF-8·초과 datagram·peer·토큰·미등록 route에는 자동 응답하지 않습니다.

start(config)·stop()·dispose()는 직렬화하고 같은 설정 start는 중복 자원을 만들지 않습니다. 설정 변경 전에 stop을 호출합니다. Bridge 등록/해제는 stopped에서만 가능하며 반환한 해제 함수는 중복 호출해도 안전합니다. 통신은 업무 Bridge를 import하지 않고 DI가 연결하며 Bridge는 payload를 검증해 Usecase를 호출합니다. 실패를 성공으로 바꾸지 않고 원래 오류는 내부 onError 콜백으로 전달하며 기본 로그에는 상세 비밀값을 출력하지 않습니다.

stop은 공유 Service를 해제하지 않고 dispose 뒤에는 start를 거부합니다. 시간 제한·종료는 업무 Promise의 강제 취소가 아니며 늦은 결과는 외부로 보내지 않습니다. 수신/브로커의 치명적 장애는 failure로 앱 종료에 전달합니다. 실제 연결·보안·부하 성공은 아직 검증하지 않았습니다.

검증 명령·선행 조건·기대 결과·실패 대응은 docs/validation/udpValidation.md를 따릅니다.

## DI에서 연결하기

아래 코드는 앱별 DI 조립 위치에 넣는 구조 예시입니다. `di`는 createDi()의 반환값이며 예시의 `bridge`는 앱이 구현한 업무 Bridge입니다. 생성 매니페스트를 직접 편집하지 않습니다. DI에서 같은 Usecase 인스턴스를 필요한 Bridge에 주입하고 통신 시작 전에 등록합니다. 외부 payload의 실제 검증은 업무 Bridge/Service가 담당합니다.

```ts
di.instances.udp.registerBridge(bridge);
// bridge: { name, handle(payload, peer) }
await di.start();
await di.instances.udp.send(
  { address: '127.0.0.1', port: 4001 },
  { route: 'status', payload: { version: 1 } },
);
```

자동 시작을 끈 통신은 di.start()만으로 열리지 않습니다. 앱 실행이 유지되는 작업 위치에서 해당 통신의 start(config)를 호출합니다. 설정은 src/backend/config의 readUdpConfig를 사용하고 실제 .env의 값을 읽도록 앱 시작 시 loadEnvironment()를 먼저 수행합니다. stop()은 통신 중단, dispose()는 재시작할 수 없는 최종 해제입니다. 업무 완료 또는 앱 종료 시 di.dispose()를 호출하며 통신을 중단했다고 공유 업무 Service를 별도로 해제하지 않습니다. 등록 해제 함수는 통신을 중단한 뒤 호출합니다.
