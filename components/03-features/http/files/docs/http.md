# HTTP 통신

Express 기반 HTTP/1.1 JSON 통신입니다. 기본 업무 API 없이 미등록 경로는 404 JSON을 반환합니다. 기본 업무 인증·저장·TLS·업로드·스트리밍은 포함하지 않습니다. CORS는 HTTP_ALLOWED_ORIGINS로 정확한 Origin을 허용하며 정적 제공은 backend-webui, WebSocket은 별도 Socket.IO 기능에서 연결합니다.

## 설정과 실행

.env.example를 .env로 복사하고 필요한 값을 작성합니다. 실제 .env는 Git에 저장하지 않습니다. OS 환경 변수가 우선하며 변경 후 앱을 재시작합니다. 빈 설정은 기본값으로 처리합니다.

| 키 | 값·기본값 |
| :--- | :--- |
| HTTP_HOST | IP 주소 또는 localhost. 기본 127.0.0.1 |
| HTTP_PORT | 정수 1~65535. 기본 3000 |
| HTTP_ALLOWED_ORIGINS | 추가 허용 HTTP(S) origin의 쉼표 목록. 기본 비어 있음, wildcard·null·계정 금지 |
| HTTP_AUTO_START | true 또는 false. 기본 생성 단계의 선택 |

npm run dev는 소스 실행·감시, npm run build 후 npm start는 빌드 결과 실행입니다. 기본 자동 시작 시 HTTP가 종료될 때까지 앱이 유지되고 Ctrl+C·SIGTERM으로 통신과 공유 자원을 정리합니다. HTTP_AUTO_START=false는 리스너 없이 객체만 준비합니다. 다른 유지 자원이 없으면 작업 완료 후 정상 종료합니다. 이후 앱 업무에서 DI의 같은 http 인스턴스에 start(config)를 호출할 수 있습니다. 테스트에서 직접 전달하는 config만 포트 0을 허용합니다.

## 등록과 수명

HTTP 객체는 di.ts에서 한 번 생성하고 DI가 공유합니다. 객체 생성은 외부 자원을 열지 않습니다. Service initialize 이후 자동 통신을 시작하고, 종료는 통신 dispose 이후 공유 Service dispose 순서입니다. 필수 연결과 추가 연결 모두 di.ts에서 직접 관리합니다. 앱 전용 Bridge 객체는 DI에서 http.registerBridge(bridge)로 전달하며 통신은 업무 Bridge를 import하지 않습니다.

HttpBridge는 고유 camelCase name과 register(router) 메서드를 갖습니다. register에서 자신의 Express Router에 허용한 경로·메서드를 등록하고 외부 payload를 검증해 Usecase를 호출합니다. Router·Request·Response를 Usecase나 shared로 전달하지 않습니다. registerBridge의 반환 함수는 등록을 해제합니다. 등록·해제는 stopped에서만 가능하고 해제 함수는 중복 호출해도 안전합니다.

start(config)는 listen 완료까지 기다리며 같은 설정의 반복 호출은 중복 서버를 만들지 않습니다. 설정 변경은 stop 후 start로 적용합니다. stop은 네트워크만 닫고 Bridge·공유 Service를 유지합니다. dispose는 최종 해제이며 이후 start를 거부합니다. 준비 중 dispose도 시작이 정리된 뒤 완료합니다. listen 실패는 시도 자원을 정리하고 오류를 호출자에게 전달하며 이전 설정으로 자동 복원하지 않습니다.

## 오류·입력 경계

공개 오류는 error.code와 error.message만 포함합니다. 미등록 경로 404, 잘못된 JSON 400, 본문 초과 413, 지원하지 않는 본문·인코딩 415, 금지 Origin 403, 미처리 오류 500입니다. 내부 스택·경로·오류 원문은 응답에 넣지 않습니다. 생성 기본 오류 로그도 원문을 출력하지 않습니다. 앱 전용 DI에서 필요한 경우 createHttpCommunication의 onError에 내부 보고 함수를 주입할 수 있습니다. 이 콜백은 원본 오류를 받으므로 비밀값이 기록되지 않게 처리해야 합니다.

본문은 모든 Content-Type에서 최대 64 KiB로 제한합니다. 비어 있지 않은 비JSON 본문·압축 본문은 허용하지 않습니다. 헤더 최대 16 KiB, 헤더 수신 10초·전체 수신 30초·처리 30초 제한입니다. Node HTTP 파서가 거부한 헤더·framing의 400/431과 헤더 시간 초과 408은 JSON을 보장하지 않습니다. 이미 응답 헤더를 보낸 뒤 오류·시간 초과는 연결을 종료합니다.

Origin이 없는 요청, 요청 Host 기준 동일 origin과 HTTP_ALLOWED_ORIGINS의 정확한 origin만 허용합니다. 허용 응답은 해당 Access-Control-Allow-Origin과 Vary: Origin을 포함하며 credential은 허용하지 않습니다. preflight는 기본 HTTP 메서드와 Accept/Content-Type만 허용합니다. null·잘못된 형식·교차 origin은 거부합니다. Host·Origin 검사는 인증이나 접근 허용 목록을 대신하지 않습니다. 프록시 신뢰·교차 origin wildcard 허용은 기본으로 제공하지 않습니다.

## 중단 제한과 검증

stop은 신규 접수를 막고 진행 응답을 최대 5초 기다립니다. 초과하면 해당 소켓을 닫고 오류를 전달하며 실제 연결이 닫힌 경우 stopped 상태에서 다시 시작할 수 있습니다. 소켓 종료가 진행 중인 업무 Promise를 자동 취소하지는 않습니다. dispose 중 정리 오류가 나도 다른 통신·공유 자원을 정리하고 원래 오류와 정리 오류를 보존합니다.

npm test는 운영 서버·데이터 없이 loopback 임시 포트만 사용합니다. 기본 npm test는 포트 점유·재시작·등록 해제·잘못된 입력·정상 종료를 빠르게 검사합니다. 실제 5초 종료 유예·10/30초 시간 제한은 npm run test:slow로 필요할 때만 별도 실행합니다. 기본 검사에서 제외한 항목을 실행 완료로 기록하지 않습니다. 기본 테스트 성공은 외부 인터페이스·방화벽·운영 인증 설정 확인을 대신하지 않습니다.

## DI에서 연결하기

다음은 import와 createDi 내부에 나누어 추가하는 부분 예시입니다. 업무 Bridge는 앱에서 준비합니다. backend-webui에는 HTTP가 이미 있으므로 다시 생성·등록하지 않고 기존 features.instances.http를 사용합니다.

```ts
// 파일: src/backend/core/di.ts
// 추가 위치 1: 파일 상단의 기존 import 아래에 추가합니다.
import { createHttpCommunication } from '../communications/http/http.communication.ts';
import { readHttpConfig } from '../config/http.config.ts';

// 추가 위치 2: createDi() 내부의 기존 features 생성 직후에 추가합니다.
// const features = createInitialFeatures(); 는 기존 코드를 유지하며 중복 추가하지 않습니다.
const http = createHttpCommunication({});
const httpConfig = readHttpConfig();
// 업무 Bridge를 구현한 경우 여기서 http.registerBridge(bridge)를 호출합니다.
features.communicationEntries.push({
  name: 'http', autoStart: true,
  start: () => http.start(httpConfig),
  stop: () => http.stop(),
  dispose: () => http.dispose(),
  failure: http.failure,
});
// 아래의 기존 return createRuntime(features, appEntries)는 유지합니다.
// 여기서 start()를 직접 호출하지 않습니다. 앱 진입점이 di.start()를 호출합니다.
```

자동 시작을 끈 통신은 di.start()만으로 열리지 않습니다. 앱 실행이 유지되는 작업 위치에서 해당 통신의 start(config)를 호출합니다. 설정은 src/backend/config의 readHttpConfig를 사용하고 실제 .env의 값을 읽도록 앱 시작 시 loadEnvironment()를 먼저 수행합니다. stop()은 통신 중단, dispose()는 재시작할 수 없는 최종 해제입니다. 업무 완료 또는 앱 종료 시 di.dispose()를 호출하며 통신을 중단했다고 공유 업무 Service를 별도로 해제하지 않습니다. 등록 해제 함수는 통신을 중단한 뒤 호출합니다.

## 적용 방식

Compose는 이 기능이 표준 구성의 필수 연결인 경우만 자동 포함합니다. 그 외에는 기능 원본의 files/에서 필요한 파일을 직접 복사하고 패키지·설정·앱 DI를 수동 연결합니다. feature add는 제공하지 않습니다. 추가 객체는 createDi 내부의 지역 변수로 만들고 필요한 Usecase·Service·Bridge의 생성자에 직접 전달합니다. 추가 기능을 사용하기 위해 DI 반환값의 instances 목록을 확장하거나 업무 코드에서 DI 전체를 조회하지 않습니다. 기능 매니페스트는 생성하지 않으며 di.ts를 직접 수정합니다.

```jsonc
// 파일: package.json
// 적용: 아래 항목을 기존 dependencies/devDependencies에 병합합니다.
// 실제 JSON에는 이 주석을 넣지 않습니다. 파일 전체를 대체하지 않습니다.
{
  "dependencies": {
    "express": "5.3.0"
  },
  "devDependencies": {
    "@types/express": "5.0.6"
  }
}
```. 필요한 항목만 앱 package.json에 반영합니다.

설정 키: `HTTP_HOST`, `HTTP_PORT`, `HTTP_AUTO_START`, `HTTP_ALLOWED_ORIGINS`. 키의 설명·비밀값 구분은 아래 설정 절과 환경 양식을 확인합니다.

공통 수동 연결 절차는 Composer 원본 `components/03-features/README.md`에 있습니다.

### 수동 생성에 필요한 원본

- `src/backend/communications/http/http.communication.ts`의 `createHttpCommunication` 사용. 생성자/factory 의존성: `{}`. 수명 메서드: 통신 start·stop·dispose 또는 수명 없음.

## package.json과 README 버전 기록

아래는 추가할 항목만 표시합니다. 같은 패키지가 있으면 중복 추가하지 말고 버전 호환성을 확인합니다. 실제 JSON에는 주석을 넣지 않습니다.

```jsonc
// 파일: package.json
// 적용: 기존 dependencies/devDependencies 객체에 아래 항목만 병합합니다.
// 파일 전체를 대체하지 않으며 기존 version과 scripts는 유지합니다.
{
  "dependencies": {
    "express": "5.3.0"
  },
  "devDependencies": {
    "@types/express": "5.0.6"
  }
}
```

```sh
# 실행 위치: 생성 앱 루트 터미널
# 적용: package.json 병합 후 실행하고 변경된 package-lock.json을 함께 관리합니다.
npm install --ignore-scripts --no-audit --no-fund
```

아래 기록을 앱 README에 추가합니다. 최초 원본 기준은 v0.0.0이며 앱에서 수정했다면 실제 변경 내용·적용일을 함께 기록합니다. 기능 원본 버전과 npm 패키지 버전, 앱 자체 버전은 별개입니다. 적용 여부가 불명확한 상태를 완료로 기록하지 않습니다.

```md
<!-- 파일: README.md -->
<!-- 적용: 기존 기능·의존성 관리 절의 표에 아래 행을 추가합니다. -->
<!-- 적용일·연결 파일은 앱의 실제 값으로 작성하고, 기존 표가 없으면 제목과 표를 함께 추가합니다. -->
## 수동 추가 기능과 버전

| 기능 | 원본 기준 | 사용 패키지 | 적용일 | 연결 위치 | 사용법 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| http | Composer v0.0.0 | express 5.3.0, @types/express 5.0.6 | YYYY-MM-DD | src/backend/core/di.ts | docs/http.md |

<!-- 기능 코드를 앱에서 수정하면 아래 변경 기록도 실제 내용으로 추가합니다. -->
### 기능 변경 기록

- YYYY-MM-DD: http — 추가 또는 수정한 내용, 실제 검사 결과와 미검증 범위
```

기능 추가만으로 package.json의 앱 version을 임의로 변경하지 않습니다. 앱 릴리스 정책에 따라 버전을 변경할 때 README 기록과 package-lock.json도 함께 맞춥니다. 실제 .env·키·토큰·로그·node_modules·dist는 저장하지 않습니다.

## Usecase 생성과 Bridge 연결 예시

아래는 문서에서만 사용하는 텍스트 처리 예시이며 기본 생성 코드에 포함하지 않습니다. 앞의 DI 연결 절에서 생성한 통신 객체를 재사용합니다. Usecase는 통신 객체나 DI 전체를 받지 않습니다.

```ts
// 파일: src/backend/usecases/text/normalizeText.usecase.ts
// 적용: 문서 예시용 새 파일 전체입니다. 실제 업무 이름과 검증 규칙으로 바꿉니다.
export class NormalizeTextUsecase {
  execute(payload: unknown): { text: string } {
    if (!payload || typeof payload !== 'object' || !('text' in payload)
      || typeof payload.text !== 'string' || payload.text.length > 1000) {
      throw new Error('Invalid text payload');
    }
    return { text: payload.text.trim() };
  }
}
```
```ts
// 파일: src/backend/bridge/text/text.http.bridge.ts
// 적용: 새 파일 전체입니다. 업무 오류는 공개 응답으로 변환합니다.
import type { HttpBridge } from '../../communications/http/http.contract.ts';
import type { NormalizeTextUsecase } from '../../usecases/text/normalizeText.usecase.ts';

export function createTextHttpBridge(usecase: NormalizeTextUsecase): HttpBridge {
  return {
    name: 'normalizeText',
    register(router) {
      router.post('/api/text', (request, response) => {
        try { response.json(usecase.execute(request.body)); }
        catch { response.status(400).json({ error: { code: 'invalidInput', message: 'Invalid input' } }); }
      });
    },
  };
}
```
```ts
// 파일: src/backend/core/di.ts
// 추가 위치 1: 파일 상단 import에 추가합니다.
import { NormalizeTextUsecase } from '../usecases/text/normalizeText.usecase.ts';
import { createTextHttpBridge } from '../bridge/text/text.http.bridge.ts';

// 추가 위치 2: createDi 내부에서 통신 객체 생성 후, runtime 반환 전에 추가합니다.
const normalizeText = new NormalizeTextUsecase();
http.registerBridge(createTextHttpBridge(normalizeText));
// backend-webui에서는 http 대신 기존 features.instances.http를 사용합니다.
// Usecase에 수명이 없으므로 빈 initialize/dispose를 등록하지 않습니다.
```
