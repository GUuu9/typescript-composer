<!-- version: v0.0.0 -->
# TypeScript Composer v0.0.0

현재 생성 범위: Compose는 표준 구성과 필수 연결만 생성합니다. 추가 통신·Service 선택과 자동 추가는 제공하지 않습니다. 기능은 필요한 파일을 복사하고 패키지·환경·DI를 수동 연결합니다. feature add는 구현 대상에서 제외합니다. 기준은 docs/contracts/manual-features-contract.md와 components/03-features/README.md를 따릅니다.

구성·통신·선택 기능을 질문해 빈 TypeScript 프로젝트를 만드는 첫 Compose 버전입니다. 업무 예제·가짜 데이터·자동 저장은 포함하지 않습니다.

## 생성

`.nvmrc`의 Node 24.22.1을 사용해 Composer 루트에서 실행합니다. Composer 자체에는 설치할 외부 의존성이 없습니다.

```sh
npm run compose
```

구성 → 프로젝트 이름 → 생성 확인 순서입니다. 구성에 허용된 선택만 표시하며 필수 통신은 제거할 수 없습니다. 이름은 소문자로 시작하는 1~64자의 소문자·숫자·하이픈입니다.

새 앱은 `project/<name>`에 생성됩니다. 독립 Git 초기화 후 install → check → test → build를 수행하고 성공한 구성만 활성화합니다. 자동 commit·remote·push는 하지 않습니다. 기존 경로는 덮어쓰지 않으며 실패·취소 시 소스·lock과 진단을 보존합니다. 실패 원인을 수정한 뒤 앱 루트에서 `npm run verify`를 실행하면 소스 재출력 없이 설치부터 다시 확인합니다.

## 표준 구성

| 구성 | 화면·실행 환경 | 통신 |
| :--- | :--- | :--- |
| typescript-backend | Node backend | 기본 통신 없음 |
| web-app | React | 기본 통신 없음 |
| web-phaser | React + Phaser | 기본 통신 없음 |
| backend-webui | Node + React 통합 제공 | HTTP 필수, 추가 통신 수동 연결 |
| electron-app | Electron Main + React | IPC 필수, 추가 통신 수동 연결 |
| electron-phaser | Electron Main + React + Phaser | IPC 필수, 추가 통신 수동 연결 |

backend-webui는 빌드된 `dist/frontend`를 backend가 함께 제공합니다. API는 `/api` 경로를 유지하며 개발 시 backend와 Vite를 함께 관리합니다. 통합·분리 질문은 없습니다. 독립 배포가 필요하면 typescript-backend와 web-app 또는 web-phaser를 각각 생성하고 공개 API 주소와 허용 Origin을 설정합니다.

Electron 단독 backend는 공개 선택에 없으며 내부 base로만 사용합니다. Phaser 구성에는 React UI와 최소 GameScene·게임 수명 연결이 포함됩니다. Phaser 4.2.1의 선언 호환 문제로 해당 frontend에 `skipLibCheck`를 사용하며 앱 소스의 strict 검사는 유지합니다.

## 앱 실행과 설정

| 앱 루트 명령 | 용도 |
| :--- | :--- |
| npm run dev | 소스 개발 실행·감시. 복합 구성은 양쪽 프로세스 관리 |
| npm start | 빌드 결과 실행. 웹 단독은 로컬 preview이며 운영 서버가 아님 |
| npm run check | 선택 영역 소스·테스트 타입 검사 |
| npm test | 선택 영역 기본 검사. 긴 제한시간 검사는 별도 |
| npm run build | 선택 영역 빌드 |
| npm run verify | 설치·check·test·build 반복 후 state 활성화 |

Electron은 최초 실행 전에 `npm run setup:electron`이 필요합니다. 설치 시 패키지 설치 스크립트는 자동 실행하지 않습니다. Node None·수동 통신만 있는 작업은 정상 종료할 수 있으며 dev 감시는 계속됩니다. Ctrl+C로 종료합니다.

선택한 설정만 `.env.example`에 제공합니다. 실제 `.env`는 사용자가 작성하며 자동 생성·재작성·커밋하지 않습니다. 실행 시 OS 환경 변수가 우선하고 설정 변경 후 재시작합니다. `.env.example`는 실행 설정으로 로드하지 않습니다. 브라우저에는 허용된 `PUBLIC_API_BASE_URL`만 공개합니다.

HTTP는 Express 수신 서버, TCP는 길이+JSON 요청/응답 서버, UDP는 unicast, MQTT는 외부 브로커 client, Socket.IO는 기존 HTTP를 공유하는 server입니다. 범용 TCP 바이너리 전송·MQTT 자동 재연결·기본 업무 Bridge는 제공하지 않습니다. Socket.IO는 HTTP를 중복 생성하지 않습니다. 세부 제한과 보안은 [계약 색인](docs/README.md)을 따릅니다.

수동 추가할 수 있는 Service는 backend/Main의 logger입니다. 기본 JSON 콘솔과 명시적으로 선택하는 회전 파일 출력을 제공하며 여러 프로세스가 같은 로그 디렉터리에 쓰는 방식은 지원하지 않습니다.

## 코드 구조

backend는 통신 → Bridge → Usecase → 필요한 Service/Repository, frontend는 Page → ViewModel → Service → Api 순서입니다. 메인 DI가 인스턴스와 수명을 조립합니다. 공통 → base → target → feature 순서로 선택한 영역만 생성합니다. 원본 배치는 [components 안내](components/README.md), 작업 규칙은 [AGENTS](AGENTS.md)를 따릅니다.

## 제공 범위와 문제 대응

v0.0.0은 위 생성 구성을 제공하는 첫 기준 버전입니다. 전체 조합·외부 연결·Electron GUI·Phaser canvas/WebGL을 모두 검증했다는 의미는 아닙니다. 과거 실제 검사 결과는 [update.md](update.md), 기능별 선택 검사 절차는 [문서 색인](docs/README.md)에 보존합니다.

사용 중 문제가 생겨 요청하면 관련 범위에서 재현·수정하고 필요한 최소 검사를 수행합니다. 별도 전체 검증은 현재 완료 조건이 아닙니다. 에이전트는 기본적으로 짧은 구문·diff 검사만 수행하며 긴 검사·설치·GUI는 자동 실행하지 않습니다.

feature add는 구현하지 않습니다. 역추출·추가 기능·공개 비대화형 CLI와 참고 예제는 별도 요청 시 진행합니다. 기존 보호 계약은 향후 기준이며 미구현 기능을 제공 완료로 안내하지 않습니다.

기존 `project/` 앱·Git·데이터·설정·state는 변경·검사·자동 이행 대상이 아닙니다. 문제 재현은 별도 임시 경로의 새 앱에서 수행합니다. Composer와 앱은 각각 독립 저장소로 관리합니다.

추가 기능 원본·복사·수명 연결 절차는 [수동 기능 안내](components/03-features/README.md)를 따릅니다.

## VS Code에서 여러 저장소 열기

```sh
# 실행 위치: Composer 루트 터미널
npm run workspace
```

project/의 실제 하위 폴더 번호를 쉼표로 선택하면 Composer와 선택 앱을 함께 여는 typescript-composer.local.code-workspace를 생성합니다. Enter는 취소이며 기존 파일 교체는 확인 후 수행합니다. VS Code에서 결과 파일을 여세요. 폴더의 Git 저장소 탐색은 VS Code가 수행합니다. 앱 내부·Git·설정은 변경하지 않고 workspace는 Git에서 제외됩니다. 자세한 기준은 [workspace 계약](docs/contracts/workspace-contract.md)을 따릅니다.

단위 검사는 Composer 루트의 `node --test test/workspace.test.mjs`이며 임시 폴더의 목록·선택·생성·교체 보호만 확인합니다. 에이전트는 이 검사를 실행하지 않았습니다.
