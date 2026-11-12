# Node + React 프로젝트

Node + React + 필수 HTTP 구성입니다. 업무 API·Page·가짜 데이터·저장은 포함하지 않습니다. compose는 integrated 통합 제공으로 생성합니다. 분리가 필요하면 backend와 웹 프로젝트를 각각 생성합니다.

## 실행과 배포

npm run dev는 backend 감시와 frontend Vite 서버를 함께 실행합니다. dev:backend·dev:frontend는 각각을 실행합니다. 필수 개발 자식이 종료되거나 Ctrl+C·SIGTERM을 받으면 나머지 프로세스·감시기·포트를 정리합니다. 소스 변경 재시작은 정상 흐름입니다.

기본 check/test/build는 양쪽 영역을 검사하며 check:backend·check:frontend, test:backend·test:frontend, build:backend·build:frontend로 분리 실행할 수 있습니다. npm run verify는 install/check/test/build를 수행하고 성공 후 구성을 활성화합니다. 기본 검사는 loopback 임시 포트만 사용하며 실제 외부 서비스에 연결하지 않습니다. 5·10·30초 제한시간 검사는 npm run test:slow로 분리했고 해당 정책 변경 시에만 실행합니다.

integrated의 npm start는 dist/backend 실행과 dist/frontend 정적 제공을 함께 수행합니다. 두 산출물이 없으면 npm run build를 먼저 실행하세요. 개발 중에는 정적 빌드가 없어도 Vite가 화면을 제공합니다. start:frontend는 로컬 preview이며 운영 서버가 아닙니다.

개발 화면은 기본 127.0.0.1:5173이고 /api를 DEV_API_TARGET(기본 http://127.0.0.1:3000)에 프록시합니다. HTTP_HOST·HTTP_PORT와 개발 프록시 주소를 함께 맞추세요. 운영에서 Api는 PUBLIC_API_BASE_URL(기본 /api)을 사용합니다. 분리 배포에서 다른 origin을 쓴다면 공개 API 주소와 backend의 HTTP_ALLOWED_ORIGINS를 명시하고 frontend를 다시 빌드하세요. HTTP_AUTO_START=false로 필수 HTTP를 끌 수 없습니다.

.env.example를 .env로 복사해 실제 값을 작성합니다. OS 환경 변수가 우선하며 파일 변경 후 앱을 재시작합니다. 브라우저에는 PUBLIC_API_BASE_URL만 전달하고 전체 환경 변수·서버 비밀값을 포함하지 않습니다. 실제 .env는 자동 생성·수정·커밋하지 않습니다.

업무 Bridge는 /api 아래에 경로를 등록합니다. 미등록 API는 JSON 404이며 HTML로 바꾸지 않습니다. 통합 제공은 공개 빌드 폴더만 제공하고 .env·dotfile·소스·루트 밖 파일은 제공하지 않습니다. frontend 구조와 Api 계약은 docs/frontend.md, HTTP 요청·수명·제한은 docs/http.md를 따릅니다. Service 준비 후 통신을 시작하고 종료 시 통신부터 공유 자원을 정리합니다.

## 파일 보호와 Git

DI·업무·문서는 사용자 소유이고 매니페스트는 생성기 관리입니다. 자동 기능 추가는 아직 제공하지 않으며 state·baseline을 수정해 우회하지 않습니다. 기존 앱은 자동 이행하지 않습니다. 개발 재시작은 메모리 상태를 초기화하지만 사용자 저장 데이터를 임의 삭제하지 않습니다.

Composer와 독립 Git 저장소입니다. 소스·테스트·문서·설정·.env.example·package-lock.json·.composer/state.json·.gitkeep을 저장하고 .env·키·토큰·node_modules·dist는 제외합니다. 커밋 제목은 type(scope): 한국어 요약이며 update.md에는 실제 검증·미검증을 기록합니다. 자동 commit·remote·push는 수행하지 않습니다.
