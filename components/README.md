<!-- version: v0.0.0 -->
# 구성품 원본

현재 생성 범위: Compose는 표준 구성과 필수 연결만 생성합니다. 추가 통신·Service 선택과 자동 추가는 제공하지 않습니다. 기능은 필요한 파일을 복사하고 패키지·환경·DI를 수동 연결합니다. feature add는 구현 대상에서 제외합니다. 각 기능 docs의 수동 연결 안내를 따릅니다.

공통과 4개 베이스의 `compose.json` 선언으로 표준 6개 구성을 조립합니다. Node·React·Electron 기반에 Phaser 웹·Electron의 최소 Scene·DI·게임 수명을 추가했습니다. 실제 canvas·WebGL·Electron GUI는 미검증입니다. 앱은 수동 폴더 복사 대신 루트의 `npm run compose`로 생성합니다.

## 원본 배치

`files/` 내부의 상대 경로가 생성 앱 루트의 상대 경로에 대응합니다. 이 README는 원본 관리 설명이며 앱 복사 대상이 아닙니다.

| 원본 | 담아두는 구성품 |
| :--- | :--- |
| `00-common/project/files` | `.gitignore`·`.nvmrc`·앱 AGENTS.md·검증 스크립트, shared·공통 test·docs·scripts·.composer 폴더 |
| `00-common/backend/files` | Node·Electron 공통 환경 로딩·수명·runtime·표준 폴더·검사·TS 기반 |
| `00-common/react/files` | React·Phaser 공용 Provider·React 패키지·TSX 기반·Vite plugin |
| `00-common/frontend/files` | React·Phaser 공통 DI·수명·Api·타입 기반·Vite 실행·환경 선언 |
| `01-base/node-backend/files` | Node 진입점·DI 연결·DI 검사·TS 설정 연결·start 스크립트·앱 README |
| `01-base/frontend/files` | React 시작·Provider·TSX 설정·React 빌드 plugin |
| `01-base/phaser/files` | Phaser 시작·최소 GameScene·화면 설정·Scene 등록·게임 수명·검사 |
| `01-base/electron-backend/files` | Main·보안 창·sandbox preload·최소 shell·개발 빌드/재시작 |
| `02-targets/node` | Node 단독 최상위 명령 |
| `02-targets/web-app`·`web-phaser` | 웹 단독 명령·문서 |
| `02-targets/backend-webui` | 복합 명령·양쪽 개발 관리·프록시 연결 |
| `02-targets/backend-webui-integrated` | 허용된 DI/start 연결 파일 교체·정적 제공 Bridge |
| `02-targets/electron-app`·`electron-phaser` | Electron 화면 결합 명령·연결 선택 |
| `03-features/ipc`·`ipc-client` | Main IPC·발신자/크기 검증·명시적 preload와 React Api 연결 |
| `03-features/http-client` | frontend HTTP Api·응답/취소/경로 검사·공개 API 주소 선언 |
| `03-features/http` | Express HTTP 통신·설정·테스트·앱 안내·의존성 및 통신 등록 선언 |
| `03-features/logger` | 선택 backend/Main Logger Service·JSON 콘솔/명시적 파일 저장·통신 오류 연결·회전·검증 문서 |
| `03-features/udp`·`mqtt`·`socket-io` | UDP unicast·외부 MQTT client·공유 HTTP Socket.IO server. 실제 연결 미검증 |
| `03-features/tcp` | Node net 기반 길이+JSON TCP 요청/응답 서버·인증·수명·설정·검사 |

`00-common` 아래는 모두 `compose.json`과 `files/`를 갖는 project·backend·frontend와 React 공용 react 구성품입니다. project(`common`)는 모든 앱의 문서·관리 파일·TypeScript/Node 타입 개발 도구만 제공합니다. backend(`backend-common`)와 frontend(`frontend-common`)는 선택한 실행 영역에만 포함하며 플랫폼별 런타임 의존성은 base에 둡니다. target이 교체하는 DI 등 연결 파일은 base 소유로 유지합니다. React 단독 base와 React+Phaser base는 최종 진입점을 각각 소유하고 react-common의 Provider·빌드 기반을 공유합니다. Node와 Electron은 backend의 대안 베이스입니다. `electron-backend`는 electron-app·electron-phaser의 내부 base이며 단독 표준 구성으로는 선택하지 않습니다. 같은 `.gitkeep`의 중복은 허용하되 실제 파일·패키지·명령·환경·등록 충돌은 계획 단계에서 거부합니다.

## 표준 구성별 베이스 조합

아래는 표준 구성별 베이스 대응표입니다. 모든 행에 `common`이 포함되며 backend 선택 시 `backend-common`, frontend 선택 시 `frontend-common`과 `react-common`을 함께 포함합니다. 통신·제공 방식은 target·feature와 함께 조립합니다.

| 표준 구성 | 선택 베이스 | 연결 역할 |
| :--- | :--- | :--- |
| typescript-backend | node-backend | None 또는 명시적으로 선택한 Node 통신 |
| web-app | frontend | 웹 시작·빌드·선택 외부 HTTP |
| web-phaser | phaser | 웹 시작·빌드·선택 외부 HTTP |
| backend-webui | node-backend + frontend | 필수 HTTP·통합 제공 |
| electron-app | electron-backend + frontend | 필수 Main–React IPC·renderer 연결 |
| electron-phaser | electron-backend + phaser | 필수 Main–Phaser IPC·renderer 연결 |

## 구성품을 채울 때

공통 → 선택 base → target → feature 순서로 계획합니다. 기본 구성과 필수 연결의 패키지·명령·의존성·등록은 `compose.json`에서 소유합니다. package.json·.env.example와 di.ts의 초기 연결은 해당 선언으로 생성합니다. 추가 기능은 자동 조립 선언 없이 소스와 수동 연결 문서로 제공합니다. target의 교체 가능 파일도 실제 연결 구현에서 명시합니다. feature는 기존 파일을 무조건 덮어쓰지 않습니다.

선택하지 않은 영역을 복사한 뒤 삭제하지 않습니다. 빈 표준 폴더는 `.gitkeep`으로 보존하며 업무 예제나 빈 클래스를 넣지 않습니다. frontend DI 경로는 AGENTS.md의 `core/di`를 따릅니다.

선언·파일 소유권·수명·상태 형식은 [승인된 공통 조립 계약](../docs/contracts/composition-contract.md)을 따릅니다. Node None·HTTP와 React·backend-webui를 선택된 베이스·target·feature로 조립합니다. 단독 웹은 backend를 포함하지 않습니다. backend는 core/di.ts, frontend는 core/di/di.ts에 초기 연결을 포함하며 생성 이후 사용자가 직접 수정합니다. 별도 features.manifest.ts는 생성하지 않습니다. 실제 검사 결과와 브라우저 검증 제한은 루트 README·update.md를 따릅니다. 자동 사후 추가 명령은 구현하지 않습니다.

[Express HTTP 계약](../docs/contracts/http-contract.md)에 통신 객체·Bridge 등록·요청 제한·종료 정책·통신 등록을 명시했습니다. 업무 API를 포함하지 않고 HTTP_HOST·HTTP_PORT·HTTP_AUTO_START·HTTP_ALLOWED_ORIGINS를 선택된 .env.example에 안내합니다.

[TCP 계약](../docs/contracts/tcp-contract.md)에 따라 backend/Main의 선택 TCP와 HTTP·IPC 복수 통신을 조립합니다. TCP 환경 양식에는 비밀 토큰 값 없이 키·설명만 포함합니다. 연결 이벤트·임의 serverSend·broadcast를 공개하는 원시 TCP 서버와 달리 길이+JSON 요청/응답 및 Bridge 등록을 제공합니다.

[웹 계약](../docs/contracts/web-contract.md)은 Api·공개 환경 값·정적 파일·개발 프로세스 기준입니다. base는 영역별 명령을 소유하고 target이 최상위 명령을 조립합니다. 파일 교체는 명시한 base 연결 파일만 허용합니다.

[Electron 계약](../docs/contracts/electron-contract.md)은 로컬 산출물·보안 창·IPC 등록·개발 재시작 기준입니다. HTTP는 Node와 Electron 양쪽의 backend 수명 계약을 사용하므로 특정 Node base 대신 backend-common을 선언 의존성으로 둡니다.

[Phaser 계약](../docs/contracts/phaser-contract.md)에 따라 프레임워크 독립 코드는 00-common/frontend, React 공용 Provider·패키지·TSX·plugin은 00-common/react, 게임 전용 코드·Phaser 의존성은 Phaser base에 둡니다. HTTP/IPC client는 frontend-common을 요구하며 React 전용으로 제한하지 않습니다. frontend 초기 연결은 di.ts에 포함하며 이후 사용자가 수정합니다.

공통 구조 변경 후 사용자 검증은 [공통 구성 검증 절차](../docs/validation/commonValidation.md)를 따릅니다. 기존 생성 앱의 원본·상태는 자동 이행하지 않습니다.

[통신 확장 계약](../docs/contracts/communication-expansion-contract.md)에 따라 UDP·MQTT·Socket.IO를 선택·등록합니다. 각 기능의 docs에는 사용 설명과 별도 Validation 문서가 함께 복사됩니다. MQTT 5.16.1·Socket.IO 4.8.4·Engine.IO 6.6.11을 선언으로 고정했으며 설치·타입·기능 검사는 사용자 실행 대기입니다. Socket.IO의 HTTP 부착은 서버 객체를 노출하지 않고 경로 handler만 연결하며 중단 시 공유 리스너를 닫지 않습니다.

Composer 계약은 ../docs/contracts/, 공통 검증 안내는 ../docs/validation/에 둡니다. 각 구성품의 files/docs/validation/은 새 앱의 docs/validation/으로 복사되며 실행 시 Composer 문서에 의존하지 않습니다. 전체 위치는 [문서 색인](../docs/README.md)을 따릅니다.

logger 등 추가 기능은 files/의 소스를 수동 복사하고 기능 docs에 따라 앱 DI·패키지·설정을 연결합니다. 추가 기능에는 compose.json 자동 조립 선언을 두지 않습니다.