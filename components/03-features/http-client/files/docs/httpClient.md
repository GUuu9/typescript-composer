# HTTP Api 사용법

web-app·web-phaser에는 파일 복사와 Api 주입을 수동으로 적용합니다. backend-webui는 필수 frontend HTTP Api로 포함합니다. 앱의 Api 의존성을 Service에 주입하고 `await api.get('/status', signal)`로 호출합니다. PUBLIC_API_BASE_URL이 /api라면 실제 요청은 /api/status입니다. backend에 해당 업무 API를 먼저 구현해야 하며 기본 생성에는 status API가 없습니다.

외부 주소는 PUBLIC_API_BASE_URL에 지정하고 frontend를 다시 빌드합니다. 외부 backend는 정확한 frontend Origin을 허용해야 합니다. 상대 /api는 같은 origin 또는 개발 프록시를 전제로 합니다. 반환값은 unknown이므로 Service에서 payload를 검증합니다. 비정상 상태·JSON 형식 오류·취소는 예외로 처리합니다. AbortController의 signal을 전달하고 화면 종료 시 abort()하여 늦은 결과 반영을 막습니다.

이 문서의 호출은 구조 설명이며 실제 업무 구현과 실행 검증을 포함하지 않습니다. 앱 루트에서 npm run check 후 선택 기능의 필요한 검사만 수행합니다.

## 적용 방식

Compose는 이 기능이 표준 구성의 필수 연결인 경우만 자동 포함합니다. 그 외에는 기능 원본의 files/에서 필요한 파일을 직접 복사하고 패키지·설정·앱 DI를 수동 연결합니다. feature add는 제공하지 않습니다. 추가 객체는 createDi 내부의 지역 변수로 만들고 필요한 Usecase·Service·Bridge의 생성자에 직접 전달합니다. 추가 기능을 사용하기 위해 DI 반환값의 instances 목록을 확장하거나 업무 코드에서 DI 전체를 조회하지 않습니다. 기능 매니페스트는 생성하지 않으며 di.ts를 직접 수정합니다.

추가 외부 패키지는 없습니다. 기본 구성의 런타임과 공통 코드를 사용합니다.

설정 키: `PUBLIC_API_BASE_URL`. 키의 설명·비밀값 구분은 아래 설정 절과 환경 양식을 확인합니다.

공통 수동 연결 절차는 Composer 원본 `components/03-features/README.md`에 있습니다.

### 수동 생성에 필요한 원본

- `src/frontend/apis/http.api.ts`의 `createHttpApi` 사용. 생성자/factory 의존성: `{}`. 수명 메서드: 통신 start·stop·dispose 또는 수명 없음.

## frontend DI에 추가할 코드

```ts
// 파일: src/frontend/core/di/di.ts
// 추가 위치 1: 기존 import 아래에 추가합니다.
import { createHttpApi } from '../../apis/http.api.ts';

// 추가 위치 2: createDi() 내부, 해당 Api를 사용하는 Service 생성 전에 추가합니다.
const api = createHttpApi({ baseUrl: import.meta.env.PUBLIC_API_BASE_URL });
// 앱의 Service 생성자에 api를 전달합니다. 예: new XxxService(api)
// backend-webui에는 api가 이미 있으므로 기존 features.instances.api를 사용합니다.
// Api 자체는 별도 initialize/dispose 등록이 필요하지 않습니다.
```

## package.json과 README 버전 기록

이 기능만을 위해 package.json에 추가할 패키지는 없습니다. 빈 dependencies 항목이나 버전·명령을 임의로 추가하지 않습니다. 소스 복사만 했다면 패키지 설치 명령도 필요하지 않습니다.

아래 기록을 앱 README에 추가합니다. 최초 원본 기준은 v0.0.0이며 앱에서 수정했다면 실제 변경 내용·적용일을 함께 기록합니다. 기능 원본 버전과 npm 패키지 버전, 앱 자체 버전은 별개입니다. 적용 여부가 불명확한 상태를 완료로 기록하지 않습니다.

```md
<!-- 파일: README.md -->
<!-- 적용: 기존 기능·의존성 관리 절의 표에 아래 행을 추가합니다. -->
<!-- 적용일·연결 파일은 앱의 실제 값으로 작성하고, 기존 표가 없으면 제목과 표를 함께 추가합니다. -->
## 수동 추가 기능과 버전

| 기능 | 원본 기준 | 사용 패키지 | 적용일 | 연결 위치 | 사용법 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| http-client | Composer v0.0.0 | 추가 패키지 없음 | YYYY-MM-DD | src/frontend/core/di/di.ts | docs/httpClient.md |

<!-- 기능 코드를 앱에서 수정하면 아래 변경 기록도 실제 내용으로 추가합니다. -->
### 기능 변경 기록

- YYYY-MM-DD: http-client — 추가 또는 수정한 내용, 실제 검사 결과와 미검증 범위
```

기능 추가만으로 package.json의 앱 version을 임의로 변경하지 않습니다. 앱 릴리스 정책에 따라 버전을 변경할 때 README 기록과 package-lock.json도 함께 맞춥니다. 실제 .env·키·토큰·로그·node_modules·dist는 저장하지 않습니다.
