<!-- version: v0.0.0 -->
# Electron Main·React 구현 계약

상태: 사용자 승인 계약입니다. 구현·실제 검증 범위는 update.md에 별도로 기록합니다.

## 구성과 산출물

- electron-backend는 electron-app·electron-phaser에서 공유하는 내부 Main·preload base입니다. 같은 이름의 단독 표준 구성은 제공하지 않습니다.
- electron-app·electron-phaser는 같은 Main 기반에 각각 React·Phaser frontend를 조립하고 IPC를 필수 자동 시작합니다.
- Main은 dist/backend, sandbox preload는 단일 CommonJS 번들 dist/preload/index.cjs, 화면은 dist/frontend에 출력합니다. preload 번들에는 Electron만 외부 모듈로 남기고 기존 Vite 빌드 도구를 재사용합니다.
- 개발도 로컬 빌드 결과를 로드합니다. 원격 개발 URL·renderer HMR·배포 패키징·자동 업데이트는 이번 범위에 포함하지 않습니다.

## 창과 수명

설정 검증 → Electron ready → DI 생성·Service 초기화 → 숨겨진 창 생성 → 필수 통신 시작 → 화면 로드·표시 순서입니다. 실패하면 확보한 통신·창·업무 자원을 역순 정리하고 원래 오류를 보존합니다. 마지막 창을 닫으면 앱을 종료합니다.

nodeIntegration=false, contextIsolation=true, sandbox=true, webSecurity=true를 명시합니다. 로컬 산출물만 로드하고 CSP로 스크립트·연결·프레임을 제한합니다. 임의 탐색·새 창·webview·권한 요청을 거부합니다. Main 환경 값과 Node 객체를 renderer에 전달하지 않습니다.

## IPC와 Api

- IpcCommunication은 start/stop/dispose와 Bridge 등록·해제를 제공하며 stop은 공유 Service를 해제하지 않습니다. 같은 설정 start는 중복 핸들러를 만들지 않고 dispose 뒤 start는 거부합니다.
- 호출마다 살아 있는 예상 WebContents·main frame·정확한 로컬 페이지를 검증합니다. 다른 창·subframe·탐색된 페이지의 요청은 거부합니다.
- frontend는 기존 Api.get(path, signal) 계약을 구현하는 IpcApi를 사용합니다. 허용 경로는 기능별 명시적 preload 메서드로 연결하며 범용 invoke·채널 인자·ipcRenderer를 노출하지 않습니다.
- 기본 앱에는 업무 경로·ping·더미 Bridge를 넣지 않습니다. 필수 IPC는 업무 등록이 없는 상태로도 시작하며 미등록 경로는 거부합니다. 등록표와 preload 연결은 생성 매니페스트 소유로 두고 사용자 DI·업무 코드를 재작성하지 않습니다.
- 전송 데이터는 직렬화 가능한 값만 허용하고 요청·응답은 각각 UTF-8 JSON 기준 64 KiB로 제한합니다. 업무 payload 검증은 Bridge/Service가 수행합니다. 공개 오류는 내부 경로·스택·비밀값을 숨깁니다.
- 종료는 새 요청 거부 → 진행 요청 최대 5초 대기 → 핸들러 해제 → 업무 자원 해제 순서입니다. 제한시간 초과를 성공으로 바꾸지 않습니다. AbortSignal은 renderer 결과 반영 중단이며 Main 작업 자동 취소가 아닙니다.
- IPC 필수 여부·허용 경로·창 보안을 .env로 완화하지 않습니다. 선택 가능한 Node 통신 설정은 기존 .env/.env.example 계약을 유지합니다.

## 명령과 개발 재시작

dev/start/check/test/build는 선택한 Main·preload·화면 전체를 대상으로 합니다. start는 기존 빌드만 실행하고 누락 시 build 방법을 안내합니다.

dev는 변경을 묶어 빌드하고 성공한 뒤 이전 Electron 종료를 기다려 하나의 앱만 다시 시작합니다. 최초 빌드 실패 시 실행하지 않으며 이후 실패 시 기존 정상 앱을 유지합니다. Ctrl+C·SIGTERM·예상하지 않은 앱 종료에는 감시기와 자식을 정리합니다.

기존 설치의 --ignore-scripts는 유지합니다. Electron 실행 파일 다운로드는 별도 npm run setup:electron 명령으로 제공하고 실행 파일이 없으면 해당 명령을 안내합니다. 생성·타입 검사·빌드 성공과 실제 Electron 실행 성공을 구분합니다.

## 검증 경계

에이전트는 짧은 문법·JSON·diff 검사만 기본 수행합니다. 설치·타입·단위·실제 연결·재시작·시간 제한·Electron 다운로드·GUI·전체 조합은 사용자가 별도 터미널에서 직접 실행하도록 경로·명령·기대 결과를 문서화하고 결과 수신 전 미검증으로 기록합니다. 기존 project/는 사용하지 않습니다.

근거: 이 문서의 Electron 로컬 빌드·재시작 기준 및 Electron 공식 security·preload 문서. 기존 수명·파일 소유권·공통 Api 계약을 확장합니다.
