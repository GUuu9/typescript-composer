<!-- version: v0.0.0 -->
# React·backend-webui 구현 계약

상태: 사용자가 승인한 계약입니다. React 단독 None/HTTP와 backend-webui 통합 제공을 지원하며 실제 검증 결과는 update.md에 기록합니다. 실제 브라우저 DOM 검사는 제어 서비스 연결 실패로 미검증입니다.

## 지원 범위

- web-app: React 웹 단독, None 또는 외부 HTTP 발신. Node 수신·통신·backend 파일을 생성하지 않습니다.
- backend-webui: Node + React + 필수 HTTP. compose는 integrated 고정이며 제공 방식을 묻지 않습니다. 분리는 typescript-backend와 web-app 또는 web-phaser를 각각 생성합니다. HTTP_AUTO_START=false는 거부합니다.
- React는 main.tsx에서 빈 main 요소를 렌더링하며 업무 Page·더미 ViewModel·가짜 API·저장은 만들지 않습니다.
- 두 구성의 타입 검사·테스트·빌드·실행을 검증한 뒤 Electron 단계로 진행합니다.

## Frontend 조립과 API

frontend/core/di의 di.ts·diProvider.tsx·features.manifest.ts·수명 코드를 사용합니다. main은 선택 객체 생성 → 필수 초기화 → React render 순서이며 실패 시 렌더링을 시작하지 않고 역순 정리합니다. HMR·해제에서도 같은 공유 객체를 정리합니다. Service가 DI 전체를 참조하거나 backend 소스를 import하지 않습니다. 기본 observable·화면 상태 구현은 실제 사용이 필요한 경우에만 추가합니다.

공통 Api 계약은 `get(path: string, signal?: AbortSignal): Promise<unknown>`를 사용합니다. HTTP 구현은 HttpApi이며 선택된 경우만 DI에 연결합니다. None에서는 HTTP 호출을 하지 않고 Api가 없는 상태를 명시합니다. get의 path는 /로 시작하는 앱 경로만 허용하며 외부 URL·//·역슬래시를 거부합니다. base 주소와 결합해 fetch하고, 비정상 HTTP status·JSON이 아닌 성공 응답은 오류로 전달합니다. payload의 업무 구조 검증은 Service 책임이며 generic 타입 단언으로 검증을 대체하지 않습니다. AbortSignal은 해당 fetch와 결과 반영을 중단하며 서버 업무의 자동 취소를 의미하지 않습니다.

frontend/api·DI의 기본 단위 검사는 mock fetch와 임시 자원만 사용합니다. TSX는 실제 웹 빌드로 검사하고 브라우저 부트스트랩의 DOM 검증은 별도로 구분하며 Node TypeScript 실행이 TSX를 직접 처리하는 것처럼 안내하지 않습니다.

## 환경 파일·공개 값

앱 루트 .env를 사용하고 OS 환경 변수가 우선합니다. .env.example는 선택한 키·설명만 제공합니다. frontend 빌드에는 아래에서 명시한 PUBLIC_API_BASE_URL 한 값만 전달합니다. 전체 process.env나 VITE_ 접두사의 임의 값을 브라우저로 내보내지 않습니다.

| 키 | 대상·기준 |
| :--- | :--- |
| PUBLIC_API_BASE_URL | HTTP frontend만 사용. web-app은 호출할 공개 HTTP(S) 주소 또는 앱 상대 경로를 지정. backend-webui 기본 /api. URL의 계정·비밀번호·query·fragment는 거부 |
| WEB_HOST | 개발·preview bind. 기본 127.0.0.1, IP 또는 localhost |
| WEB_PORT | 개발 서버 포트. 기본 5173, 정수 1~65535 |
| WEB_PREVIEW_PORT | 로컬 preview 포트. 기본 4173, 정수 1~65535 |
| DEV_API_TARGET | backend-webui 개발 /api 프록시 대상. 기본 http://127.0.0.1:3000. 브라우저에는 전달하지 않음 |
| HTTP_ALLOWED_ORIGINS | backend의 추가 허용 origin을 쉼표로 지정. 기본 비어 있음. origin 단위 exact match, wildcard·null·계정·query·fragment 거부 |

HTTP_HOST·HTTP_PORT·HTTP_AUTO_START의 기존 의미를 유지합니다. 단독 web-app HTTP 선택에서는 PUBLIC_API_BASE_URL을 명시하지 않으면 get 사용 전에 오류를 전달합니다. 기본 빈 화면이 외부 API에 임의 요청하지 않으며 생성·기본 검사가 외부 API 연결을 시도하지 않습니다.

.env 변경은 각 실행/빌드를 다시 시작해 반영합니다. PUBLIC_API_BASE_URL은 정적 빌드에 고정되는 공개 값이며 분리 배포에서 변경 시 frontend를 다시 빌드합니다. Vite preview는 운영 서버가 아닙니다.

## HTTP·정적 파일·Origin

backend-webui의 업무 HTTP 경로는 /api 아래에 등록합니다. 미등록 /api 및 /api/...는 기존 JSON 404를 유지하며 HTML로 대체하지 않습니다. 브라우저 Api의 기본 base /api에 앱 상대 경로를 더합니다. 기본 생성에는 업무 Bridge가 없습니다.

integrated의 빌드 결과 실행은 backend가 고정된 dist/frontend의 공개 산출물만 제공합니다. 소스·.env·.composer·dotfile·다른 경로는 제공하지 않습니다. 경로 이탈·심볼릭 링크를 통한 루트 밖 접근을 거부합니다. GET/HEAD의 존재하는 공개 파일과 HTML 탐색 요청을 처리하고, 누락된 asset·API·JSON 요청을 index.html로 바꾸지 않습니다. index.html이 없으면 build 방법을 안내하고 시작을 실패시킵니다. 개발 실행은 dist가 없어도 동작하며 Vite가 화면을 담당합니다.

독립 배포는 backend와 웹 앱을 각각 생성합니다. backend는 허용된 Origin에만 Access-Control-Allow-Origin을 해당 origin으로 반환하고 Vary: Origin을 설정합니다. OPTIONS preflight는 허용된 origin·메서드·헤더만 처리합니다. credential·wildcard·자동 인증 허용은 넣지 않습니다. 기존 HTTP 단독도 이 명시적 허용 목록을 사용할 수 있으나 빈 기본값의 정책은 유지합니다.

개발 프록시는 /api를 backend에 전달하되 API 경로를 제거하지 않습니다. 외부 사이트의 Origin을 임의로 같은 origin으로 바꿔 허용하지 않습니다. 프록시는 개발 전용이며 분리 운영 배포의 CORS 설정을 대신하지 않습니다.

## 명령과 프로세스

web-app의 dev는 Vite 개발, start는 dist/frontend의 로컬 preview입니다. backend-webui는 dev:backend·dev:frontend를 개별 제공하고 기본 dev가 둘을 함께 시작·종료합니다. backend-webui start는 API와 정적 파일을 함께 제공합니다.

check:backend·check:frontend, test:backend·test:frontend, build:backend·build:frontend를 해당 영역에 제공하고 결합 구성의 기본 check/test/build는 양쪽을 모두 실행합니다. Node 타입·브라우저 DOM·TSX 설정은 영역별로 분리하고 shared는 필요한 범위만 포함합니다. output은 기존 dist/backend와 dist/frontend입니다.

기본 dev는 필수 자식의 spawn 실패·비정상 종료·예기치 않은 정상 종료 시 다른 자식·감시기·포트를 정리하고 실패를 표시합니다. Ctrl+C·SIGTERM은 양쪽을 정리하고 정상 종료합니다. Node watch의 의도된 앱 재시작과 복구 가능한 소스 오류는 감시 프로세스가 살아 있는 동안 전체 실패로 처리하지 않습니다. 포트 충돌은 다음 포트로 조용히 이동하지 않고 오류로 처리합니다.

## 구성품 선언·보호

React base는 frontend 소스·타입 검사·Vite 입력·테스트를 소유합니다. web-app·backend-webui의 target은 명령 조립·실행 연결 차이를 선언합니다. base의 명령이 다른 구성의 명령과 충돌하지 않도록 각 base는 영역 명령을 선언하고 최상위 명령은 target이 소유하는 방식으로 정리합니다. Node 단독 명령의 기존 동작은 보존합니다.

frontend 매니페스트는 frontend/core/di/features.manifest.ts에 생성하며 backend 매니페스트와 소유권·등록 영역을 구분합니다. 생성된 매니페스트만 generated로 관리하고 DI·업무·문서는 처음 생성 후 사용자 소유입니다. .env와 기존 project/는 수정하지 않습니다. 새 target 교체는 base가 명시적으로 허용한 최초 생성 연결 파일에만 적용합니다. 무조건 덮어쓰기·기존 앱 자동 이행·사후 추가 명령은 구현하지 않습니다.

## 완료 검사

아래는 사용자 직접 실행할 단계 검증 기준입니다. 에이전트는 짧은 문법·JSON·diff 검사만 기본 수행하며 설치·타입·단위·loopback·통합·전체 조합·GUI 검사는 자동 실행하지 않습니다. 작업 경로·정확한 명령·기대 결과를 문서로 남기고 결과 수신 전 미실행·미검증으로 기록합니다. 실제 5·10·30초 제한 검사는 생성 HTTP 앱의 test:slow로 분리해 기본 test/verify에서 제외합니다. 검증 대기만으로 독립적인 구현을 중단하거나 관련 변경 없이 통과한 검사를 반복하지 않습니다.

- 단독 None·HTTP, 결합 통합 제공의 생성·선택/충돌·미선택 영역 제외.
- 각 구성 install/check/test/build와 선택 영역별 명령·생성 상태 검증.
- HTTP Api의 성공·status/JSON 오류·취소·경로 검증, frontend 초기화·해제.
- 실제 웹 로딩·빈 React root·공개 값만 번들에 포함·서버 비밀값 제외.
- integrated의 정적/SPA 경로·누락 asset·/api 404·경로 이탈 거부·빌드 누락 실패.
- 독립 웹 앱의 API 주소·CORS 허용/거부·preflight, 개발 /api 프록시의 실제 요청.
- 복합 dev 양쪽 시작·소스 변경·자식 실패·Ctrl+C 후 포트/프로세스 정리.
- 기존 Node None·HTTP의 회귀. 운영 서버·실제 사용자 데이터·외부 API는 사용하지 않음.

## 근거

- Vite 설정과 공개 값 define: https://vite.dev/config/shared-options
- Vite 서버·프록시: https://vite.dev/config/server-options
- Vite Node API: https://vite.dev/guide/api-javascript

현재 패키지는 React/React DOM 19.3.1, Vite 8.3.8, @vitejs/plugin-react 6.3.0, React/React DOM 타입 19.3.0으로 고정합니다. Vite 설정은 scripts/web.mjs의 Node API에서 관리하며 envDir 로드를 끄고 앱 루트 .env만 명시적으로 읽습니다. frontend 브라우저 타입과 Node 테스트 타입은 별도 tsconfig로 검사합니다.
