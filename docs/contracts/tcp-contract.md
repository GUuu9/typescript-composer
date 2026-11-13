<!-- version: v0.0.0 -->
# TCP 구현 계약

상태: 사용자 승인 계약입니다. 구현·실제 검증 범위는 update.md에 기록합니다.

## 범위와 조립

통신 확장은 TCP → UDP → MQTT → Socket.IO 순서로 진행합니다. 이번 계약은 첫 단계인 TCP 수신 서버입니다. Node 기본 net을 사용하며 외부 패키지는 추가하지 않습니다. 발신 전용 TCP client·자동 재연결·broadcast·TLS·임의 바이너리 프로토콜은 이번 범위에 넣지 않습니다.

typescript-backend의 선택 통신과 backend-webui·electron-app·electron-phaser의 추가 Main/backend 통신으로 조립합니다. 정적 웹 frontend에는 포함하지 않습니다. HTTP·IPC와 동시 선택해도 업무 객체는 같은 DI 인스턴스를 공유하며 기본 업무 Bridge·예제 데이터는 생성하지 않습니다.

원본은 components/03-features/tcp에 두고 기존 통신 등록·환경 선언·선택 검증·생성 매니페스트를 확장합니다. 기존 앱이나 사용자 DI를 재작성하지 않습니다. 신규 생성만 지원하며 feature add는 구현하지 않습니다.

## 파일과 API

| 앱 파일 | 책임 |
| :--- | :--- |
| backend/communications/tcp/tcp.communication.ts | TcpCommunication·createTcpCommunication. 서버·연결·요청·종료 소유 |
| backend/communications/tcp/tcp.contract.ts | TcpConfig·TcpBridge·TcpState·TCP 전송 내부 타입 |
| backend/communications/tcp/tcp.frame.ts | 길이 헤더·분할/병합 수신·UTF-8·JSON 경계 검사 |
| backend/config/tcp.config.ts | readTcpConfig·validateTcpConfig |
| test/backend/tcp.test.ts | 설정·framing·Bridge·loopback·수명 핵심 검사 |
| docs/tcp.md | 전송 규격·설정·등록·제한·검증 절차 |

start(config)·stop()·dispose()와 읽기 전용 state·address를 제공합니다. 상태는 stopped·starting·running·stopping·disposed입니다. 생성자는 소켓·리스너·타이머를 열지 않습니다. 호출을 직렬화하고 같은 정규화 설정 start는 중복 연결을 만들지 않습니다. 설정 변경은 stop 후 적용하며 시작 실패 시 이전 설정으로 복원하지 않습니다. dispose 요청 후 새 start는 거부합니다.

registerBridge(bridge)는 등록 해제 함수를 반환합니다. TcpBridge는 고유 camelCase name과 handle(payload: unknown): unknown | Promise<unknown>을 가집니다. 등록·해제는 stopped 상태에서만 허용하며 중복 해제는 안전합니다. 업무 payload는 Bridge에서 검증하고 Usecase를 호출합니다. 통신 구현은 업무 Bridge를 import하지 않으며 Node Socket을 Usecase나 shared 계약으로 넘기지 않습니다.

## 환경 파일

앱 루트 .env를 읽고 OS 환경 변수를 우선하는 기존 규칙을 유지합니다. 실제 .env를 생성·재작성하지 않으며 선택 TCP의 .env.example에는 키와 설명만 제공합니다.

| 키 | 기준 |
| :--- | :--- |
| TCP_HOST | 기본 127.0.0.1. IP 주소 또는 localhost |
| TCP_PORT | 기본 4000. 환경 값은 1~65535 정수, 테스트의 직접 설정만 0 허용 |
| TCP_AUTO_START | true/false. 빈 값은 대화형에서 선택한 기본값 |
| TCP_AUTH_TOKEN | 선택 비밀값. 설정 시 공백 없는 인쇄 가능한 ASCII 32~256자. loopback 외 bind에는 필수 |

토큰을 지정하면 loopback에서도 인증을 요구합니다. token 원문은 state·로그·공개 오류에 넣지 않습니다. 설정 검증은 자동 시작이면 객체 생성 전에, 필요 시 시작이면 해당 start 전에 수행합니다. 수동 통신만 있고 다른 유지 자원이 없는 Node 앱에는 가짜 대기 루프를 넣지 않습니다.

이 서버는 평문 TCP입니다. 공유 토큰은 암호화를 제공하지 않으므로 외부 bind는 신뢰할 수 있는 망에서 사용하는 범위입니다. 인터넷 노출용 TLS·사용자별 인증은 별도 계약으로 확장합니다.

## TCP 전송 규격

한 frame은 4-byte unsigned big-endian 본문 길이 + 해당 길이의 UTF-8 JSON입니다. 헤더를 제외한 최대 크기는 64 KiB이며 0 또는 초과 길이는 본문 할당 전에 거부합니다. UTF-8 오류·잘린 frame·잘못된 JSON을 검증하며 하나의 data 이벤트를 하나의 요청으로 가정하지 않습니다. 분할 수신과 여러 frame의 병합 수신을 모두 처리합니다.

- 인증 필요 시 첫 frame: { type: 'auth', token: string }. 성공 응답: { type: 'auth', ok: true }. 실패는 안전한 unauthorized 오류 후 연결을 닫습니다. 인증 전 업무 요청을 처리하지 않습니다.
- 요청: { type: 'request', id: string, route: string, payload: unknown }. id는 영문·숫자·밑줄·하이픈 1~64자이며 route는 등록한 Bridge의 camelCase name입니다. 누락·알 수 없는 필드를 거부합니다.
- 성공: { type: 'response', id, ok: true, data: unknown }.
- 실패: { type: 'response', id: string | null, ok: false, error: { code, message } }. id를 신뢰할 수 없는 framing/형식 오류는 null을 사용하고 연결을 닫습니다. 응답 전송 자체가 안전하지 않으면 오류 frame 없이 연결만 닫습니다.

미등록 route는 notFound로 응답하며 가짜 성공을 반환하지 않습니다. 잘못된 요청은 invalidRequest, 초과 본문은 payloadTooLarge, 업무 예외·잘못된 결과는 internalError, 처리 제한시간 초과는 requestTimeout으로 변환합니다. 인증 실패 응답도 동일 framing을 사용하고 비밀값을 포함하지 않습니다. 원본 오류는 내부 보고 콜백에 보존하고 공개 응답에는 스택·내부 경로·원문을 넣지 않습니다.

payload와 결과는 JSON 값으로 제한합니다. 응답 envelope까지 64 KiB 안에 들어야 하며 순환·bigint·undefined·비유한 수 등 부적합 결과를 성공으로 변환하지 않습니다. 정상 업무 오류는 다른 요청과 구분하고 연결 framing이 유지되는 한 다음 요청을 처리할 수 있습니다.

## 자원 제한과 종료

동시 연결은 최대 64개입니다. 연결당 요청을 순차 처리하고 응답 쓰기 완료/역압을 기다려 무제한 업무 큐·응답 버퍼를 만들지 않습니다. TCP half-close에서는 이미 완성된 요청의 응답을 마친 뒤 연결을 닫고, 미완성 frame의 EOF는 거부합니다.

인증은 연결 후 10초, frame 수신은 첫 byte부터 총 30초, 업무 처리와 응답 쓰기는 각각 30초, 대기 연결은 60초로 제한합니다. 데이터가 조금씩 도착한다는 이유로 frame 제한시간을 연장하지 않습니다. 인증/framing/시간 제한 위반은 해당 연결만 닫습니다. 종료 유예는 5초입니다. 긴 실제 시간 제한 검사는 기본 검사와 분리합니다.

stop은 신규 연결·새 업무 접수를 차단하고 대기 연결을 닫은 뒤 이미 접수한 요청을 최대 5초 기다립니다. 이후 남은 소켓·타이머·리스너를 정리하며 유예 초과는 오류로 전달합니다. 정리가 끝나면 stopped에서 재시작할 수 있습니다. 공유 Service와 Bridge 정의는 유지하며 dispose가 최종 해제합니다. 닫힌 연결과 이전 실행의 늦은 결과는 전송하지 않습니다. 소켓 종료나 시간 제한은 업무 Promise의 강제 취소를 의미하지 않습니다.

listen 실패는 해당 시도 자원을 정리하고 원인·정리 오류를 보존합니다. 실행 중 개별 연결 오류는 해당 연결만 정리하지만 수신 서버의 치명적 장애는 앱 수명 관리자에 전달해 통신·업무 자원을 정리하고 실패 종료합니다. 자동 재연결·자동 복원은 하지 않습니다.

## 치명적 장애 전달

사용자가 DI의 CommunicationEntry에 failure를 지정해 해당 인스턴스의 읽기 전용 failure: Promise<never>를 연결합니다. 일반 stop/dispose와 개별 요청 실패는 이를 reject하지 않습니다. TCP 수신 서버의 치명적 장애만 원래 오류로 reject하며 앱 종료 후 같은 인스턴스를 복원하지 않습니다.

Node·Electron의 동일 수명 관리자에서 이 실패를 관찰하고 시작 중/실행 중 모두 성공으로 바꾸지 않습니다. Node 진입점의 자연 종료 대기와 Electron 창 수명에서도 실패 종료를 반영합니다. 기존 HTTP·IPC는 이 선택 선언이 없으면 기존 동작을 유지합니다. 필요 시 start 실패는 해당 start의 오류로 처리하며 다른 통신을 임의 중단하지 않습니다.

## 최소 검증과 후속 작업

구현 중 단위·loopback·통합·제한시간 검사는 자동 실행하지 않습니다. framing의 분할/병합·크기/UTF-8·인증·등록·종료/재시작·치명적 장애·복수 통신 공유·부분 시작 실패의 검증 절차를 문서로 남기고 사용자가 기능 사용 시 직접 실행합니다. 에이전트는 짧은 문법·diff 확인만 기본 수행하며 다른 직접 검증은 사용자 명시 요청 범위로 제한합니다. 기존에 실제 수행한 결과는 보존하고 아직 실행하지 않은 항목을 구분합니다.

기존 project/는 어떤 검사에도 사용하지 않습니다. 기본 검사에 긴 대기를 넣지 않고 TCP의 긴 검사는 선택된 구성에만 테스트 파일의 slow: 이름을 지정해 직접 실행합니다. UDP·MQTT·Socket.IO의 전송별 기준은 통신 확장 계약을 따릅니다.

근거: 승인된 공통 조립·HTTP 계약과 이 문서의 통신 수명 기준. Node 기본 API는 [net](https://nodejs.org/download/release/v24.22.1/docs/api/net.html)·[stream](https://nodejs.org/download/release/v24.22.1/docs/api/stream.html)·[token 비교](https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptotimingsafeequala-b)를 따릅니다.

## 진행 업무 제한과 오류 기록

연결과 무관하게 실제 완료되지 않은 Bridge 업무를 최대 64개 추적합니다. 상한에 도달한 요청은 Bridge를 호출하지 않고 busy 응답을 반환합니다. 완료 시에만 슬롯을 반환하며 stop 제한 초과·재시작으로 기존 업무 슬롯을 지우지 않습니다. 연결 종료 후 발생한 업무 실패도 onError에 한 번 전달합니다.
