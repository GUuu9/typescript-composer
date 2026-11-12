# TCP 사용 전 검증

사용자가 별도 터미널에서 실행하는 절차입니다. 결과를 확인하기 전에는 미검증이며 기존 project/ 앱·운영 데이터·실제 비밀값을 시험 대상으로 쓰지 않습니다. Composer가 생성한 별도의 새 검증 앱을 사용합니다.

## 생성과 기본 확인

Composer 루트에서 `npm run compose`를 실행해 새 이름으로 생성합니다. Node 단독은 구성 1에서 tcp 또는 http,tcp, Electron은 구성 5에서 ipc,tcp 또는 http,tcp를 선택합니다. 웹 결합은 필수 HTTP/IPC를 유지한 채 tcp를 추가합니다. 생성기의 verify는 설치·check/test/build를 수행하므로 이 생성 명령은 사용자가 검증할 때 실행합니다. 비대화형 공개 생성 CLI는 아직 없습니다.

이하 명령의 작업 경로는 새로 생성한 검증 앱 루트입니다. .nvmrc의 Node 24.22.1과 npm이 필요하며 실제 .env는 저장하지 않습니다. 실패한 생성은 보존된 앱에서 수정·재실행하고 같은 이름으로 덮어쓰지 않습니다.

| 명령 | 선행 조건·목적 | 기대 결과 |
| :--- | :--- | :--- |
| npm install --ignore-scripts --no-audit --no-fund | 의존성 미설치 시. 레지스트리 접근 필요 | 설치 성공·lock 보존. Electron binary 다운로드는 별도 |
| npm run check | 설치 완료. 소스·통신 매니페스트·테스트 타입 확인 | 오류 없이 종료 |
| node --test --test-skip-pattern="^slow:" test/backend/tcp.test.ts | loopback bind 권한 필요. TCP 핵심 검사만 | 인증·framing·상태·오류·재시작 검사 통과, 긴 검사 제외 |
| npm test | 선택 영역 전체의 기본 검사 | 기존 영역과 함께 통과. slow:는 제외 |
| npm run build | 설치 완료. 선택 영역의 빌드 | dist/backend 생성, Electron은 preload/shell 등도 생성 |
| npm run verify | 실패 복구 뒤 전체 설치·검사·빌드와 state 활성화 확인 | 전체 성공 시에만 pending 구성이 활성화 |

Composer 자체 조립·치명적 장애 전달 검사는 Composer 루트에서 `node --test --test-skip-pattern="^slow:" test/tcp.test.mjs`로 실행합니다. bind를 제한한 환경에서는 권한 있는 로컬 터미널이 필요합니다. 정상 검사를 반복할 필요는 없습니다.

## 실제 시작·자동/수동 설정

검증 앱 루트에서 `npm start`로 빌드 결과 또는 `npm run dev`로 개발 실행을 시작합니다. 기본 주소는 127.0.0.1:4000입니다. 포트 점유 시 검증 앱 .env의 TCP_PORT를 사용 가능한 값으로 바꿉니다. TCP_AUTO_START=false만 있는 Node 앱은 소켓을 열지 않고 정상 종료하는 것이 맞습니다. Electron은 먼저 `npm run setup:electron`을 실행합니다.

- TCP_AUTO_START=true: 설정 검증 후 listen. Ctrl+C 뒤 포트 재사용과 자식 종료 확인.
- TCP_AUTO_START=false: 수신 포트가 열리지 않음. 앱의 명시적 start에서 설정 검증·연결이 시작됨.
- 외부 bind와 토큰 누락/잘못된 형식: listen 전에 실패. 로그에 실제 토큰이 나타나면 안 됨.
- HTTP/TCP 복수 선택: 서로 다른 포트에서 시작. 같은 업무 객체를 사용한 검증 fixture의 호출·수명 확인. 시작 중 TCP 포트 충돌 시 먼저 열린 HTTP·업무 자원이 정리되어야 함.

## 핵심 경계

| 항목 | 기대 결과 |
| :--- | :--- |
| header/body를 여러 번 나눠 전송, 여러 frame을 합쳐 전송 | 각 요청을 정확히 한 번 해석 |
| 길이 0·64 KiB 초과·잘린 frame·잘못된 UTF-8/JSON | 안전하게 거부하고 해당 연결 정리 |
| 인증 전 요청·잘못된 토큰 | 업무 호출 없이 unauthorized 후 연결 종료 |
| 올바른 토큰 | 인증 성공 뒤 등록한 요청만 처리 |
| 미등록 route | notFound. 가짜 성공 응답 없음 |
| 업무 예외·순환/undefined/초과 결과 | 내부 정보 없는 오류. 원본은 내부 보고 경계에 보존 |
| 요청 완료 뒤 half-close | 응답을 마친 뒤 연결 종료 |
| 진행 요청 중 stop | 새 접수 차단, 기존 요청 처리 후 종료 |
| 같은 설정 start·stop 후 start | 중복 서버 없음, 재시작 가능 |
| 다른 설정 start·dispose 뒤 start | 거부 |
| 수신 서버의 치명적 오류 | failure 전달·자원 정리·앱 실패 종료. 개별 연결 오류와 구분 |

기본 앱에는 업무 Bridge가 없습니다. 업무 fixture는 검증 앱/test에만 추가하고 구성품 기본 업무 코드로 넣지 않습니다. 원시 문자열·임의 바이너리 송신·broadcast는 현재 프로토콜의 검증 항목이 아닙니다.

## 긴 시간·부하·환경 검사

검증 앱 루트에서 `npm run test:tcp:slow`는 실제 약 5초를 기다려 미완료 요청의 강제 연결 정리·오류 반환·재시작을 확인합니다. 기본 검사와 별도입니다.

다음 항목은 자동 수행되지 않았으며 별도 fixture/client가 필요합니다: 인증 10초, 첫 byte부터 frame 수신 30초, 업무 처리 30초, 응답 쓰기 30초, 대기 연결 60초, 동시 연결 64개 제한·느린 수신자의 역압, 반복 연결 부하, 실제 외부 망, Electron GUI, 다른 OS. 제한시간이 끝나도 원래 업무 Promise의 강제 취소를 보장하지 않습니다. 평문 TCP 토큰을 운영 망에 노출하지 않습니다.

실패 시 명령·단계·오류 코드·선택 구성을 기록하고 실제 토큰·payload는 제거해 공유합니다. 원인 수정 후 실패한 검사만 재실행하며 state·baseline을 직접 바꿔 우회하지 않습니다.

## 연결 종료 후 업무 정리 회귀 확인

새 검증 앱 루트에서 `node --test --test-name-pattern="TCP stop waits for work after the client disconnects" test/backend/tcp.test.ts`를 실행합니다. loopback bind 권한이 필요합니다. 연결 종료 후에도 보류 중 업무 때문에 stop이 대기하고, 업무 완료 후 정상 종료해야 합니다.

5초 제한 확인은 같은 경로에서 `node --test --test-name-pattern="slow: TCP shutdown" test/backend/tcp.test.ts`로 별도 실행합니다. 시간 초과는 명시적 실패이며 소켓 종료가 업무 강제 취소를 뜻하지 않습니다. 제한을 넘긴 업무는 계속 실행될 수 있고 전체 업무 수 제한은 이번 수정에 추가하지 않았습니다. 두 검사 모두 에이전트는 미실행입니다.
