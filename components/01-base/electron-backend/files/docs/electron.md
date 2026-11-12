# Electron 실행

`npm run verify`는 --ignore-scripts 설치·check/test/build입니다. Electron 실행 파일·실제 GUI 검증과 구분합니다. 첫 실행 전 `npm run setup:electron`으로 실행 파일을 내려받으세요. 네트워크와 Electron 배포 서버 접근이 필요합니다.

`npm start`는 dist/backend·dist/preload와 dist/shell 또는 dist/frontend를 실행합니다. `npm run dev`는 src·scripts·tsconfig·package.json·.env 변경을 묶어 .composer의 임시 경로에서 빌드합니다. 성공한 결과만 이전 앱 종료 후 교체합니다. 실패 시 기존 앱과 dist를 유지하고 다음 변경을 기다립니다. 마지막 창을 닫거나 Ctrl+C를 누르면 종료합니다. .composer/build-*는 임시 산출물이며 Git에 저장하지 않습니다.

Main은 backend DI·수명을 사용합니다. Electron 타입 선언이 DOM 타입을 참조하므로 backend 타입 설정에 DOM lib를 포함하지만 화면은 renderer 책임입니다. React는 frontend DI와 Api를 사용하며 Node나 Main 객체를 import하지 않습니다.

IPC는 살아 있는 예상 창·main frame·정확한 로컬 페이지를 매 요청마다 검사합니다. 등록 경로만 이름 있는 preload 메서드로 공개하고 임의 채널 호출은 제공하지 않습니다. 기본 앱에는 업무 메서드가 없습니다. 현재 get은 query 없는 정확한 경로·인자 없는 메서드입니다. 입력이 필요한 업무는 payload 계약과 Bridge 검증을 정의한 후 확장합니다. 요청·응답은 JSON 직렬화 가능한 값으로 각각 최대 64 KiB입니다. 종료 시 진행 요청을 최대 5초 기다리며 초과는 오류입니다. AbortSignal은 renderer의 결과 반영 중단이며 Main 작업 자동 취소가 아닙니다. 종료 제한시간은 Main 업무의 강제 취소도 보장하지 않습니다.

기능 구성품은 compose.json의 ipcRoutes에 path·method·channel·registration을 선언하고 같은 backend 등록 객체를 IpcBridge로 연결합니다. Bridge의 route는 해당 선언과 일치해야 합니다. 경로·메서드·채널·Bridge 중복과 누락을 생성 전에 거부합니다. shared/ipcRoutes.manifest.ts와 features.manifest.ts는 생성기 소유이므로 직접 수정하지 않습니다. 사후 추가 명령은 아직 없습니다.

.env는 Main만 읽고 renderer·preload에 환경 전체를 전달하지 않습니다. 선택 HTTP는 HTTP_* 설정을 사용합니다. IPC 보안·필수 자동 시작은 환경 값으로 완화하지 않습니다. 로컬 화면 산출물 외 파일·네트워크·새 창·탐색·권한 요청은 거부합니다. renderer의 외부 통신은 별도 보안 계약 후 확장합니다.

실제 GUI 검사: setup:electron → start로 빈 창 표시·닫기 종료 확인 → dev에서 Main/preload/React 소스 수정 후 재시작 → 타입 오류 시 기존 창 유지 → 오류 수정 후 재시작 → Ctrl+C 후 프로세스 종료를 확인합니다. 자동 검사와 별도로 결과를 기록합니다.

일반 Node 단위 테스트는 Electron Main용 di.ts를 import하지 않고 core/runtime.ts와 수명 관리자를 검사합니다. BrowserWindow·ipcMain이 포함된 실제 DI의 실행은 Electron 프로세스 검증으로 구분합니다. 이미 생성한 앱의 같은 오류는 Composer의 최신 test/backend/lifecycle.test.ts 원본을 해당 테스트 파일에 적용합니다. React 앱은 frontend의 최신 test/frontend/di.test.ts도 적용합니다. 생성기 소유 매니페스트나 state는 수정하지 않습니다.
