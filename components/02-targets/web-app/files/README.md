# React 웹 프로젝트

업무 Page·예제 데이터 없이 빈 React root를 렌더링합니다. backend·Node 통신·저장은 포함하지 않습니다. HTTP를 선택한 경우에만 HttpApi가 frontend DI에 등록됩니다.

## 명령

- npm run dev / dev:frontend: Vite 개발 서버. 기본 127.0.0.1:5173.
- npm run check / check:frontend: frontend·shared·frontend 테스트 타입 검사.
- npm test / test:frontend: 외부 연결 없는 DI·선택 Api 검사.
- npm run build / build:frontend: 타입 검사와 dist/frontend 빌드.
- npm start / start:frontend: dist/frontend 로컬 preview. 기본 127.0.0.1:4173이며 운영 서버가 아닙니다.
- npm run verify: install/check/test/build 전체 검사. 성공 후 구성 활성화.

Node 버전은 .nvmrc를 따릅니다. .env.example를 .env로 복사해 선택 설정을 작성합니다. OS 환경 변수가 우선하며 .env는 자동 생성·수정·커밋하지 않습니다. WEB_HOST·WEB_PORT·WEB_PREVIEW_PORT는 개발/preview 설정입니다. PUBLIC_API_BASE_URL만 명시적으로 브라우저에 전달합니다. HTTP 단독 선택에서는 get 호출 전에 공개 API 주소를 지정하세요. 계정·비밀번호·query·fragment를 base 주소에 넣지 않습니다. 공개 주소 변경 후 다시 빌드하세요.

폴더 역할·수명·데이터 흐름은 docs/frontend.md를 따릅니다. 자동 기능 추가는 아직 지원하지 않으며 generated features.manifest.ts·state·원본 해시를 직접 수정해 우회하지 않습니다. 사용자 DI·업무·문서는 처음 생성 후 사용자 소유입니다.

Composer와 독립 Git 저장소입니다. 소스·테스트·문서·설정·.env.example·package-lock.json·.composer/state.json·.gitkeep을 저장합니다. 실제 .env·키·토큰·node_modules·dist는 제외합니다. 커밋 제목은 type(scope): 한국어 요약이며 update.md는 실제 검증 범위를 기록합니다. 자동 commit·remote·push는 수행하지 않습니다.
