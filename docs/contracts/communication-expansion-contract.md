<!-- version: v0.0.0 -->
# UDP·MQTT·Socket.IO 구현 계약

상태: 사용자 승인 계약입니다. UDP·MQTT·Socket.IO를 제공하며 실제 검증 범위는 update.md에 기록합니다. 기존 TCP·HTTP·IPC, 표준 6개 구성과 React·Phaser 작업은 유지합니다.

## 공통 조립·환경·수명

typescript-backend의 선택 통신과 backend-webui·electron-app·electron-phaser의 추가 backend/Main 통신으로 제공합니다. 정적 웹·renderer용 MQTT·Socket.IO client는 이번 범위에 포함하지 않습니다. 업무 예제·기본 업무 Bridge·저장 기능·브로커는 생성하지 않습니다.

원본은 03-features/udp·mqtt·socket-io에 두고 각 기능 docs가 복사 파일·패키지·환경·DI 연결을 안내합니다. 내부 식별자는 udp·mqtt·socketIo이며 파일은 udp.communication.ts·mqtt.communication.ts·socketIo.communication.ts, 설정은 udp.config.ts·mqtt.config.ts·socketIo.config.ts로 통일합니다. 클래스와 factory는 UdpCommunication/createUdpCommunication, MqttCommunication/createMqttCommunication, SocketIoCommunication/createSocketIoCommunication입니다.

공통 start(config)·stop()·dispose(), stopped·starting·running·stopping·disposed 상태, stopped에서만 Bridge 등록/해제, 동일 설정 중복 시작 방지, 설정 변경 전 stop, 부분 실패 자원 정리와 원인 보존을 유지합니다. 필요 시 시작 통신은 소켓·구독·재연결 타이머를 열지 않습니다. 업무 객체는 같은 DI 인스턴스를 공유하고 통신은 업무 Bridge를 import하지 않습니다.

실제 .env는 생성·재작성하지 않습니다. OS 환경을 우선하며 선택한 통신의 키·설명만 .env.example에 추가합니다. 비밀값·브로커 자격 증명은 로그·공개 오류·state·frontend에 넣지 않습니다. stop은 공유 Service를 해제하지 않으며 dispose 후 재시작을 거부합니다. 실행 중 복구 불가능한 수신/연결 장애는 기존 failure 계약으로 앱에 전달합니다.

## UDP

- Node node:dgram 기반 unicast 송수신입니다. broadcast·multicast·자동 재전송·분할 재조립·신뢰성 보장은 추가하지 않습니다.
- 설정은 UDP_HOST(기본 127.0.0.1), UDP_PORT(기본 4001), UDP_AUTO_START, UDP_AUTH_TOKEN, UDP_ALLOWED_PEERS입니다. host는 IP/localhost, 포트는 환경에서 1~65535이며 직접 검사 설정만 0을 허용합니다. allowedPeers는 정확한 IP 목록이며 비어 있으면 loopback 송수신만 허용합니다. 외부 bind에는 TCP와 같은 32~256자 인쇄 가능한 ASCII 토큰과 명시적 peer 목록이 필요합니다.
- datagram 하나는 UTF-8 JSON { route, payload, token? }이며 전체 최대 1200 bytes입니다. route는 camelCase Bridge name입니다. UTF-8·필드·크기·peer·token을 검사하고 token은 Bridge에 전달하지 않습니다. Bridge는 handle(payload, peer)로 입력을 받으며 peer는 address·port 값만 담습니다.
- 잘못되거나 허용하지 않은 datagram에는 자동 응답하지 않습니다. UDP 반사 응답을 기본 동작으로 만들지 않습니다. send(peer, message)는 허용 peer에 동일한 JSON envelope를 전송하며 OS 전송 완료만 의미합니다. 수신·업무 처리·정확히 한 번 실행을 보장하지 않습니다.
- 최대 동시 처리 16개이며 초과 수신은 큐 없이 버립니다. 업무 처리 제한 30초, 종료 유예 5초입니다. 제한 초과 시 업무 Promise가 실제 종료됐다고 간주하지 않으며 참조·동시 처리 제한을 유지하고 늦은 결과를 전송하지 않습니다. 유실·중복·순서 변경은 업무 프로토콜에서 처리합니다.

## MQTT

- MQTT.js 기반 외부 브로커 client이며 MQTT 3.1.1, clean session, QoS 0/1을 제공합니다. 브로커 내장·QoS 2·지속 오프라인 큐·retained 발행·자동 재연결은 이번 범위에서 제외합니다. 단절은 failure로 전달하며 복구는 새 앱 실행 또는 단절 전 명시 stop/start로 수행합니다.
- 설정은 MQTT_URL(자동 시작 시 필수, mqtt/mqtts만 허용), MQTT_CLIENT_ID(필수), MQTT_USERNAME·MQTT_PASSWORD(선택 비밀값), MQTT_AUTO_START입니다. URL에 자격 증명을 넣지 않습니다. TLS 인증서 검증을 해제하는 환경 옵션은 제공하지 않습니다. mqtts는 OS 신뢰 체인을 사용합니다.
- Bridge는 name·topic·qos·handle(payload, message)를 선언합니다. topic은 정확한 문자열만 허용하며 wildcard·$SYS와 중복 topic은 거부합니다. message에는 topic·qos·retain·dup 값만 전달하고 업무 payload는 Bridge에서 검사합니다. start는 연결 및 전체 SUBACK 성공 후 완료되며 중간 거절은 연결·구독을 정리합니다.
- publish(topic, payload, qos)는 JSON 값·topic·최대 64 KiB를 검사하며 연결 완료 상태에서만 허용합니다. QoS 0은 송신 완료, QoS 1은 브로커 ACK까지이며 구독자의 업무 성공을 의미하지 않습니다. MQTT ACK와 업무 처리는 별개이고 QoS 1 중복은 업무에서 멱등 처리합니다.
- 최대 동시 업무/발행은 각각 16개이고 무제한 큐를 만들지 않습니다. 초과 수신은 보고 후 버리며 발행은 명시 실패합니다. 연결·구독·발행 제한은 각각 10초, 업무 처리는 30초, stop 유예는 5초입니다. stop은 새 수신/발행을 차단하고 처리 중 요청·발행을 정리한 뒤 연결을 종료하며 초과를 오류로 전달합니다. 재연결·오프라인 발행 큐를 비활성화합니다.

## Socket.IO와 공유 HTTP

- Socket.IO server를 기존 HttpCommunication 하나에 연결합니다. 별도 HTTP 서버·포트를 만들지 않습니다. socketIo 선택은 http를 한 번 포함하며 HTTP가 준비된 뒤 시작하고 역순으로 중단합니다. 자동 시작 socketIo에 필요한 HTTP를 환경으로 끄는 조합은 시작 전에 거부합니다. 수동 시작 시 HTTP가 준비되지 않으면 해당 start만 실패합니다.
- HTTP에 서버 부착/해제 계약을 추가합니다. HTTP 전체 객체를 업무에 넘기지 않으며 DI가 Socket.IO 생성자에 필요한 서버 연결 계약만 주입합니다. Socket.IO가 연결된 동안 HTTP 단독 stop은 먼저 Socket.IO stop을 요청하도록 거부합니다. 앱 종료에서는 Socket.IO를 먼저 해제합니다.
- 경로는 /socket.io로 고정하며 polling과 WebSocket을 허용합니다. 기존 HTTP 404·요청 처리·upgrade 거부와 충돌하지 않게 라우팅합니다. Socket.IO stop은 연결·Engine.IO·소유 리스너만 정리하고 HTTP 서버·HTTP Bridge·공유 Service를 유지합니다. io.close()로 공유 HTTP를 닫지 않습니다. HTTP 재시작 뒤에는 새 서버에 다시 연결합니다.
- 설정은 SOCKET_IO_AUTO_START·SOCKET_IO_AUTH_TOKEN입니다. bind 주소·포트·정확한 Origin 허용 목록은 HTTP_HOST·HTTP_PORT·HTTP_ALLOWED_ORIGINS를 재사용합니다. 브라우저 Origin은 목록과 정확히 일치해야 하며 Origin 없는 client는 토큰 인증을 요구합니다. 외부 bind도 토큰 필수이며 토큰 기준은 TCP와 같습니다. 토큰은 handshake.auth.token으로만 받습니다. 이 인증은 전송 암호화를 제공하지 않습니다.
- 고정 request 이벤트는 { route, payload }와 필수 ack 함수를 받습니다. camelCase name의 Bridge handle(payload)를 호출하고 ack는 { ok: true, data } 또는 { ok: false, error: { code, message } }입니다. 미등록 route·잘못된 입력·초과 크기·업무 예외·시간 제한을 안전한 공개 오류로 변환합니다. 임의 이벤트·namespace·room·범용 Socket 객체를 업무에 공개하지 않습니다.
- 메시지·응답은 UTF-8 JSON 최대 64 KiB, 연결은 최대 64개, 소켓당 동시 요청은 1개이고 단절 후 남은 업무도 포함해 전체 진행 업무는 64개로 제한합니다. 인증 대기 10초·업무/ack 제한 30초·종료 유예 5초이며 초과를 성공으로 바꾸지 않습니다. 늦은 업무 결과는 ack하지 않으며 실제 종료 전 동시 처리 자리를 반환하지 않습니다. client 단절은 해당 client만 정리합니다.

## 구현과 사용자 검증 문서

각 기능은 docs/udp.md·mqtt.md·socketIo.md와 docs/validation/udpValidation.md·mqttValidation.md·socketIoValidation.md를 생성합니다. 경로·Node 버전·설치/check/test/build 명령·선행 설정·기대 결과·실패 후 재시도 방법을 명시합니다. MQTT는 사용자 관리 브로커와 명시적인 검사 topic·client ID, Socket.IO는 별도 검사 client를 사용하며 기본 앱에 업무 fixture를 넣지 않습니다.

조립·환경·충돌·수명·입력 경계의 필요한 검사 코드를 작성하고 loopback·외부 연결·재시작·정리 제한·복수 통신 공유·부분 시작 실패·실제 인증/Origin 검증 절차를 문서화합니다. 에이전트는 문법·JSON·diff만 확인하며 설치·타입·기능 검사·시간 제한·외부 브로커·GUI를 자동 실행하지 않습니다. 결과 수신 전 모두 미실행·미검증으로 기록합니다. 기존 project/는 변경·검사하지 않습니다.

근거: [Node dgram](https://nodejs.org/api/dgram.html), [MQTT.js 연결·구독·종료 API](https://github.com/mqttjs/MQTT.js), [Socket.IO Server API](https://socket.io/docs/v4/server-api/)와 기존 TCP·HTTP·공통 조립 계약입니다.
