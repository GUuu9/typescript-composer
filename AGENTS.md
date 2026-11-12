<!-- version: v0.0.0 -->
# TypeScript Composer 작업 지침

이 문서는 TypeScript Composer v0.0.0의 유지보수 규칙입니다. 표준 6개 구성·통신·선택 logger의 제공 범위는 README를 따릅니다. 미검증 기록은 update.md에 보존하며 미구현 기능을 제공 완료로 설명하지 않습니다.

## 작업 범위와 보호

project/의 기존 앱·독립 Git·데이터·설정·.composer 상태는 수정·삭제·설치·시험 대상으로 사용하지 않습니다. 제거된 이전 구현을 자동 복원하지 않습니다. 검증은 별도 임시 경로의 새 프로젝트에서 수행합니다. 기존 앱 이행은 별도 요청 범위입니다.

기존 사용자 변경과 stage 상태를 확인하고 보존합니다. 명령은 Composer와 생성 앱의 저장소를 구분해 실행합니다. 업무 예제·가짜 데이터·더미 클래스를 기본 생성에 넣지 않습니다.

## 유지보수와 검사

역추출·feature add와 보호/복구·추가 기능은 별도 요청 시 진행하며 현재 필수 후속 작업이 아닙니다. 사용 중 문제 보고가 있으면 관련 범위에서 재현·수정합니다.

기본 확인은 짧은 구문·diff 검사입니다. 설치·단위·loopback·시간 제한·전체 조합·GUI 검사는 자동 실행하지 않으며 사용자가 명시적으로 요청한 범위에서 수행합니다. 필요한 사용자 검사에는 경로·명령·선행 조건·목적을 안내합니다. 실제 실행하지 않은 검사는 미검증으로 기록하며 과거 통과 결과를 이번 검증으로 표현하지 않습니다. 통과한 검사는 관련 변경·실패·남은 의문이 없으면 반복하지 않습니다.

새 실행 계약이나 명명 규칙은 근거를 제안하고 사용자 확인 후 적용합니다. 이미 합의한 규칙은 반복 승인받지 않습니다.

Phaser의 승인된 Scene·DI·앱 수명·명령 계약은 [Phaser 계약](docs/contracts/phaser-contract.md)을 따릅니다.

React·backend-webui의 승인된 API·공개 환경 값·정적 제공·프로세스 계약은 [웹 계약](docs/contracts/web-contract.md)을 따릅니다.

HTTP의 파일·등록·요청 제한·종료 정책은 [HTTP 계약](docs/contracts/http-contract.md)을 따릅니다.

TCP의 승인된 framing·인증·제한·종료·치명적 장애 전달 계약은 [TCP 계약](docs/contracts/tcp-contract.md)을 따릅니다. UDP·MQTT·Socket.IO의 구현·검증 범위는 통신 확장 계약과 update.md를 따릅니다.

승인된 선언·소유권·수명·상태 계약은 [공통 조립 계약](docs/contracts/composition-contract.md)을 따릅니다. npm run compose는 인자 없이 시작해 구성·기능을 질문하고 프로젝트 이름을 마지막으로 입력받습니다. 새 앱의 npm run verify는 소스를 재출력하지 않고 install/check/test/build 전체를 반복하며 성공 후에만 구성을 활성화합니다.

## 구성 선택과 조립

하나의 구성 목록을 대화형·비대화형 CLI·검증·생성 계획에서 공통으로 사용합니다.

| 구성 | 필수·선택 연결 |
| :--- | :--- |
| typescript-backend | None 또는 HTTP·TCP·UDP·MQTT·Socket.IO 중 명시적 선택. IPC 제외 |
| web-app·web-phaser | 기본 None, 외부 HTTP 허용. Node 통신·Main IPC 제외 |
| backend-webui | HTTP 필수·통합 제공 고정. 분리는 backend와 웹 프로젝트를 각각 생성. backend에 추가 Node 통신 허용 |
| electron-app·electron-phaser | Main–renderer IPC 필수. Main에 추가 Node 통신 허용 |

None과 통신 동시 명시는 거부합니다. 필수 통신은 제거하지 못하고 기본 자동 시작합니다. Socket.IO의 HTTP 의존 등 필수 항목은 중복 인스턴스 없이 포함합니다. Service·util은 실행 영역·프레임워크·선행 조건으로 제한합니다. 저장은 명시 선택입니다. 미지원 조합·누락·순환·패키지/환경/등록 충돌은 출력 전에 거부합니다.

구성품 원본은 components/00-common·01-base·02-targets·03-features로 나누고 공통 → 선택 base → target → feature 순서로 계획합니다. 00-common은 project·backend·frontend와 React 공용 react 각각의 compose.json·files 구조로 통일하고 선택한 실행 영역의 공통만 포함합니다. target은 선언한 연결 파일만 교체하며 feature의 무조건 덮어쓰기를 금지합니다. backend 전체를 복사하고 정적 웹에서 삭제하는 방식을 쓰지 않습니다. compose.json이 패키지·명령·의존성·등록을 소유합니다.

## 표준 폴더와 명명

선택 영역의 다음 표준 폴더를 비어 있어도 .gitkeep으로 보존합니다. 미선택 영역은 만들지 않습니다. 같은 .gitkeep의 중복은 충돌로 보지 않습니다.

| 위치 | 책임·파일 접미사 |
| :--- | :--- |
| backend/core | 메인 di.ts·features.manifest.ts. lifecycle은 수명, security는 신뢰 검증 |
| backend/communications/<protocol> | 연결·수신·전송·구독·재연결·종료. 구체 파일명은 계약 확정 후 작성 |
| backend/bridge/<feature> | 업무 입력 검증·Usecase 호출·전송 응답. *.http.bridge.ts·*.ipc.bridge.ts 등 |
| backend/usecases/<feature> | 업무 순서. *.usecase.ts |
| backend/services/<feature> | 공유 기능·외부 I/O. *.service.ts |
| backend/repository/<feature> | 데이터 조회·저장 의미. *.repository.ts |
| backend/utils·config | *.util.ts·*.config.ts·공개 .json |
| frontend/core/di | di.ts·diProvider.tsx·features.manifest.ts·수명·observable |
| frontend/scenes/<feature> | *.page.tsx·*.page.css·*.viewmodel.ts·*.model.ts·Phaser *.scene.ts |
| frontend/services/<feature> | 기능 처리·payload 검증. *.service.ts·*.model.ts |
| frontend/apis | 공통 api.ts·추가 *.api.ts·타입 선언 *.d.ts |
| frontend/components/<name> | 재사용 UI. *.component.tsx·*.component.css |
| frontend/utils·resource | *.util.ts·정적 자산·assets.ts |
| shared | 실행 영역 간 직렬화 계약 *.contract.ts·필요한 *.validation.ts |
| preload | Electron index.ts·기능별 *.preload.ts |
| test | 선택 영역별 backend/frontend·shared·integration. *.test.ts·필요 시 *.test.tsx |
| docs·scripts·.composer | 앱 설명·관리 .mjs·상태와 baseline |

core/composition·최상위 models를 만들지 않습니다. 내부 Model·계약은 소유 기능에 함께 둡니다. shared에는 Node·Electron·Express 객체·비밀값을 넣지 않습니다.

소스 기능 폴더·파일 기본명·함수·변수는 camelCase로 통일하고 약어도 di·http·ipc처럼 처리합니다. 명명 예외를 두지 않습니다. 클래스·인터페이스·React 컴포넌트 식별자는 PascalCase, 역할 접미사는 소문자입니다. package.json·AGENTS.md 등 도구 지정 파일과 공개 구성/CLI 식별자는 소스 명명과 별도 범주입니다. Promise만을 이유로 Async 접미사를 붙이지 않습니다.

## 계층·생성·오류

frontend는 Page → ViewModel → Service → Api입니다. Page는 렌더링·입력, ViewModel은 화면 상태·중복 방지·취소, Service는 기능 처리·payload 검증, Api는 HTTP/IPC/로컬 호출을 담당합니다. HTTP·Electron Api는 공통 get 경로 계약을 사용하고 필요 시 쓰기 전송 메서드를 확장합니다. Electron은 허용 경로를 명시적 preload 메서드로 연결합니다.

backend는 통신 → Bridge → Usecase → 필요한 Service/Repository입니다. 업무 순서는 Usecase가 결정합니다. 모든 기능에 Repository와 Service 양쪽을 강제하지 않습니다. 메인 di가 객체를 만들고 필요한 의존성만 생성자로 주입합니다. 업무 객체가 di 전체를 참조하지 않습니다.

기능 Service는 class·생성자 주입을 기본으로, 순수 계산은 util 명명 함수로 작성합니다. util은 입력을 변이하지 않고 static class로 감싸지 않습니다. 재사용 구성품은 create<Feature>Service(deps)를 Service 파일에 함께 제공하고 복잡한 생성만 create<Feature>.ts로 분리합니다. 앱 전용 객체는 di에서 직접 생성할 수 있습니다.

의미가 필요한 위치에서만 오류를 변환하고 cause를 보존합니다. 공개 Bridge는 내부 경로·스택·비밀값을 숨기고 공개 오류로 변환합니다. 실패를 성공으로 바꾸지 않습니다. 타입 공유와 별도로 실행 시점 외부 입력·payload를 검증합니다.

## 수명과 통신 제어

설정 검증 → 객체 생성·주입 → 필수 Service 의존 순서 initialize → 준비 완료 후 통신·화면·작업 시작 순서입니다. 수명 없는 Service에는 빈 메서드를 강제하지 않고 지연 초기화는 기본 지원하지 않습니다. 초기화 실패 시 후속 실행을 막고 부분 확보 자원을 역순 정리하며 원래 오류와 정리 오류를 보존합니다.

Initializable·Disposable 타입은 core/lifecycle/lifecycle.contract.ts에 두고 Service는 import type으로 참조합니다. compose.json의 수명 등록 선언을 생성 매니페스트로 연결하고 같은 인스턴스를 메인 di의 수명 관리자에 등록합니다. 인터페이스만으로 자동 호출되지 않습니다. 선언·구현 불일치와 순환을 검사합니다. 중복 초기화·해제와 초기화 도중 종료도 안전하게 처리합니다.

통신은 0개·단일·복수를 지원하고 같은 업무 객체를 공유합니다. 통신은 업무 Bridge를 직접 import하지 않으며 di가 연결합니다. 발신이 필요한 업무에는 publish 등 필요한 계약만 주입합니다.

start(config)는 연결·수신·구독 시작, stop은 재시작 가능한 중단, dispose는 최종 해제입니다. 자동 시작과 필요 시 시작을 구분하고 대기 통신은 외부 연결·리스너·재연결 타이머를 열지 않습니다. 동일 설정 start는 중복 연결을 만들지 않고 설정 변경은 stop 후 적용합니다. 시작 실패 시 해당 시도 자원을 정리하고 이전 설정으로 자동 복원하지 않습니다. stop은 공유 업무 Service를 해제하지 않습니다.

종료는 접수 중단 → 진행 요청 정리 → 통신·구독 해제 → 업무 자원 역순 해제입니다. 재연결 타이머와 중복 호출을 조정하고 dispose 후 start를 거부합니다. 앱 시작 중 필수 통신 실패는 시작한 통신·자원을 정리하며, 필요 시 시작 실패는 다른 통신을 임의 중단하지 않습니다. 프로토콜별 요청 정리 제한시간·장애 정책은 구체 계약에 명시합니다.

## 보안과 실행 검증

IPC는 살아 있는 예상 창·frame·페이지를 확인하고 renderer의 Node 접근·범용 ipcRenderer 공개를 금지합니다. Origin·입력 크기·메시지 경계·형식·인증 설정을 전송에 맞게 검증합니다. AbortSignal은 결과 반영 중단이며 Main 작업 자동 취소로 설명하지 않습니다.

dev는 개발 실행, start는 빌드 결과, check/test/build는 전체 선택 영역을 대상으로 합니다. 웹 start의 preview는 운영 서버가 아닙니다. 복합 웹은 개별 실행과 함께 기본 dev가 양쪽 프로세스를 관리합니다. Electron은 로컬 빌드 결과를 사용하고 정상 재빌드 뒤 앱 재시작을 제공합니다. 실패한 빌드로 실행을 교체하지 않습니다. 필수 자식의 비정상 종료·Ctrl+C에는 자식·감시기·포트를 정리합니다. None 작업 정상 종료와 의도한 재시작을 장애로 보지 않습니다.

기본 검증은 운영 서버·사용자 데이터 없이 수행합니다. 생성·설치·check/test/build·필수 설정·실제 외부 연결 결과를 구분합니다. 신규 생성 실패·취소 시 소스·lock·진단을 보존하고 실패 단계와 재실행 방법을 안내하며 비밀값을 로그에 남기지 않습니다.

## 사후 추가와 파일 보호

새 앱은 project/<name>에 생성하고 추가 원본은 부모 components/로 고정합니다. 앱 실행·빌드는 복사본만 사용합니다. 원본 누락은 변경 전 중단·예상 경로 안내로 처리하며 원격 탐색·자동 재연결·고정 릴리스 복원은 기본 지원하지 않습니다.

관련 구성품의 영역·스키마·의존성·실제 충돌을 검사하고 무관한 전체 원본 변경만으로 막지 않습니다. 사용자 di·업무 코드·문서를 재작성하지 않습니다. 생성 매니페스트의 사용자 변경은 충돌로 처리하고 package.json·환경 예시는 새 항목만 병합합니다. 새 추가가 기존 기능 전체 갱신으로 이어지지 않게 합니다.

충돌은 변경 전 중단하고 파일·패키지·등록 위치·순서·검증 방법을 안내합니다. 수동 적용 후 필수 파일·등록·호환성·설치·검사를 확인하고 성공 시에만 활성 상태와 관련 기준값을 기록합니다. 실패 시 기존 state와 사용자 수동 작업을 보존합니다. 자동 적용 실패는 변경 소스·package/lock·state를 복구하며 node_modules·산출물·외부 설치 부작용은 복구 범위 밖입니다.

원본 해시나 state를 직접 바꿔 우회하지 않습니다. 추가 명령은 루트 feature add <app> <item>, 앱 feature add <item> 체계로 구현하고 compose add 별칭을 만들지 않습니다. 새 하위 명령은 계약과 검증을 갖춘 뒤 안내합니다.

## Git 저장과 변경 이력

Composer와 앱은 독립 저장소로 각각 커밋합니다. 작업 전 경로·저장소 루트·브랜치·상태를 확인합니다. 원본 .gitignore는 /project/*와 !/project/.gitkeep을 유지하며 앱 생성 때 수정하지 않습니다. 이미 추적한 파일은 ignore로 자동 제외되지 않습니다.

선택된 통신 설정은 앱 루트 .env로 관리하고 OS 환경 변수를 우선합니다. 실제 .env는 자동 생성·재작성하지 않으며 .env.example에는 선택한 키와 설명만 제공합니다. 필수 통신은 환경 설정으로 비활성화하지 못하고 브라우저에는 허용된 공개 값만 전달합니다.

공유·버전 관리용 설정 대체품은 .env.example로 관리합니다. 실제 값과 비밀값은 넣지 않으며 .env.example를 실행 설정으로 자동 로드하지 않습니다. 현재 선택한 구성에 필요한 항목만 유지합니다.

실제 .env·키·토큰·캐시·node_modules·dist·release를 저장하지 않습니다. 앱은 소스·설정·테스트·문서·package-lock.json·.composer/state.json·.gitkeep을 저장합니다. git init은 자동 commit·remote·push 허가가 아닙니다.

커밋 제목은 type(scope): 한국어 요약입니다. type은 feat/fix/refactor/docs/test/build/ci/chore/revert, scope는 소문자 kebab-case입니다. 한 목적의 코드·검사·문서·update.md를 묶고 독립 저장소를 섞지 않습니다. 제목에서 작업 번호·중간 과정·완료 수식어·개인 정보를 제외합니다. 호환성 변경은 type(scope)!:와 본문 이행 방법으로 표시하고 Git 자동 merge/revert 메시지는 보존합니다.

update.md는 최신순·커밋당 한 항목으로 작성합니다. 제목은 날짜·커밋 제목, 본문은 핵심 변경 1~3줄·실제 검증/미검증 1줄이며 실제 영향이 있을 때만 호환성·데이터·복귀 주의를 덧붙입니다. 미커밋 작업은 맨 위 항목 하나로 통합하고 긴 과정 로그를 남기지 않습니다. 기존 이력은 오류 정정 외 보존하며 현재 커밋 해시를 미리 넣지 않습니다.

관련 파일만 선택적으로 stage하고 cached diff와 git diff --cached --check를 확인합니다. 과거 검사 결과를 이번 검증으로 표현하지 않습니다. commit·push·이력 재작성은 요청 범위에서만 수행합니다. 원격 업데이트 전 변경을 보존하고 remote·브랜치·차이를 확인하며 강제 reset·전체 덮어쓰기로 복구하지 않습니다.

Phaser 구성의 React UI·게임 호스트·공용 DI 및 수명 분리는 [React·Phaser 계약](docs/contracts/phaser-contract.md)을 따릅니다. react-common은 React 단독과 Phaser 결합의 Provider·React 패키지·TSX·Vite plugin을 공유하며 최종 main과 게임 코드는 선택 base가 소유합니다.

UDP·MQTT·Socket.IO의 송수신·인증·공유 HTTP·중단·검증 문서 기준은 [통신 확장 계약](docs/contracts/communication-expansion-contract.md)을 따릅니다.

선택 logger의 영역·비밀값·파일 보존·큐·수명·통신 onError 연결은 [Logger 계약](docs/contracts/logger-contract.md)을 따릅니다.

선택 Service·util의 현재 구축 범위는 logger로 한정합니다. 추가 Service·util 목록을 미리 채우는 작업은 현재 완료 조건에 포함하지 않습니다. 이후 사용자가 실제 프로젝트에서 필요성과 재사용 가치를 확인한 항목을 요청할 때 하나씩 계약·구성품·검증 문서로 추가합니다. 역추출과 feature add(충돌 보호·실패 복구·수동 적용 확인 포함)는 사용자의 별도 요청이 있을 때 진행하며 현재 완료 조건에서 제외합니다. 기존 계약은 향후 구현 기준으로 보존하며 해당 기능이 구현되었다고 안내하지 않습니다. 별도 전체 조합·기능 검증은 현재 필수 후속 작업으로 두지 않습니다. 사용 중 문제가 발생해 사용자가 요청하면 관련 범위에서 재현·수정하고 필요한 최소 검사를 수행합니다. 기존 미실행·미검증 기록과 검증 문서는 보존하며 검증 완료로 바꾸지 않습니다.
