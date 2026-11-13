# Node TypeScript 프로젝트

선택한 통신만 포함하는 Node TypeScript 프로젝트입니다. 저장·업무 예제는 넣지 않습니다. HTTP를 선택한 앱은 docs/http.md의 설정·요청 제한·종료 정책을 함께 따릅니다.

## 시작과 검증

Node 버전은 `.nvmrc`를 따릅니다. dev와 test는 Node의 내장 TypeScript 실행을 사용하므로 enum·생성자 매개변수 속성처럼 변환이 필요한 문법은 사용하지 않으며 check에서 이를 검사합니다. `npm run verify`는 install → check → test → build를 수행하고 성공 시 `.composer/state.json`의 대기 구성을 활성화합니다. 설치는 의존성 설치 스크립트를 실행하지 않습니다. 실패 시 소스·lock을 보존하며 원인을 수정한 뒤 같은 명령으로 다시 검사할 수 있습니다. 재검증은 설치부터 전체 검사를 반복하고 소스를 재출력하지 않습니다.

| 명령 | 동작 |
| :--- | :--- |
| npm run dev | 소스 감시·실행. None 작업 종료 후에도 감시 대기. 통신 선택 시 실행을 유지합니다. Ctrl+C로 종료 |
| npm start | dist/backend/index.js 실행. 빌드 결과가 없으면 build 안내. None·수동 통신만 있는 작업은 정상 종료, 자동 통신은 종료 요청까지 유지 |
| npm run check | 소스와 테스트 타입 검사 |
| npm test | 실제 DI·수명·선택 통신 테스트. 운영 서버·사용자 데이터 사용 안 함 |
| npm run build | src를 dist로 컴파일 |
| npm run verify | 설치·전체 검사·빌드·상태 활성화. 앱 실행·외부 연결은 별도 |

앱 시작 시 앱 루트의 .env를 읽고 OS 환경 변수를 우선합니다. .env가 없어도 실행할 수 있지만 읽기 실패는 중단합니다. 필요하면 .env.example를 .env로 복사해 작성하고 변경 후 앱을 재시작하세요. 실제 .env는 자동 생성·수정·커밋하지 않으며 검사·빌드는 실행 환경의 .env를 자동 로드하지 않습니다. None에는 환경 필수 키가 없으며 선택 통신의 설정 키는 .env.example에 안내합니다. 의존성은 package.json과 package-lock.json에 기록합니다. backend build는 dist/backend와 dist/shared를 먼저 정리합니다. frontend·preload 산출물은 보존하며 빌드 실패 후에는 다시 빌드한 뒤 실행하세요.

## 코드 배치

HTTP 선택 앱의 실제 시간 제한 검사는 `npm run test:slow`로 별도 실행합니다. 기본 test/verify는 긴 검사를 제외하며, 제한시간 정책을 바꿀 때만 해당 검사를 실행합니다.

`src/backend/index.ts`가 DI 준비 후 작업을 실행하고 finally에서 종료합니다. `core/di.ts`는 생성 매니페스트의 객체와 앱 전용 수명 대상을 같은 수명 관리자에 연결합니다. 수명 없는 객체에는 빈 메서드를 만들지 않습니다.

| 폴더 | 역할·접미사 |
| :--- | :--- |
| backend/core | di.ts·features.manifest.ts, lifecycle의 계약·역순 정리, security의 신뢰 검증 |
| backend/communications | 선택 프로토콜의 연결·수신·전송. HTTP 선택 시 http 구현 포함 |
| backend/bridge | 외부 입력·업무 호출·응답 경계. *.http.bridge.ts 등 |
| backend/usecases | 업무 순서. *.usecase.ts |
| backend/services | 공유 기능·외부 I/O. *.service.ts |
| backend/repository | 조회·저장 의미. *.repository.ts |
| backend/utils·config | 순수 함수 *.util.ts, 설정 *.config.ts·공개 JSON |
| shared | 실행 영역 간 직렬화 계약 *.contract.ts·검증 *.validation.ts |
| test/backend·shared·integration | 선택 영역 검사 *.test.ts |
| docs·scripts·.composer | 앱 문서·관리 명령·상태 및 baseline |

업무 데이터 흐름은 통신 → Bridge → Usecase → 필요한 Service/Repository입니다. None에서는 통신이 없으며 진입점의 작업 위치에서 앱 업무를 시작합니다. 자동 통신은 Service 준비 후 listen하며 종료 시 통신을 먼저 dispose합니다. 설정 검증 → DI 생성 → 의존 순서 initialize → 업무 → 역순 dispose를 지킵니다. 초기화 중 종료는 현재 초기화가 끝나길 기다리며 강제 타임아웃은 제공하지 않습니다.

## 기능 추가와 Git

현재 자동 기능 추가 명령은 제공하지 않습니다. 매니페스트·원본 해시·state를 직접 편집해 우회하지 마세요. DI·업무·문서는 사용자 소유이고 초기 연결은 di.ts 안에서 사용자가 직접 관리합니다. 향후 추가 원본은 부모 Composer의 components/이며 실행·빌드는 앱 복사본만 사용합니다.

이 앱은 Composer와 독립 Git 저장소입니다. Git 초기화는 commit·remote·push를 수행하지 않습니다. 소스·문서·테스트·설정·package-lock.json·.composer/state.json·.gitkeep을 저장하고 실제 .env·키·토큰·node_modules·dist·release는 저장하지 않습니다. 커밋 제목은 type(scope): 한국어 요약으로 작성하며 update.md는 최신순으로 실제 검증 범위를 기록합니다.
