# Logger Service

Node backend·Electron Main의 선택 Service입니다. logger 소스를 복사하고 앱 DI에서 인스턴스와 통신 onError를 직접 연결합니다. 웹 단독·renderer에는 추가하지 않으며 전역 예외·원격 수집·frontend 전송을 자동 설치하지 않습니다.

## 설정·사용

앱 루트 .env의 LOGGER_LEVEL은 debug/info/warn/error(기본 info), LOGGER_OUTPUT은 console/file/both(기본 console)입니다. OS 환경이 우선하고 .env.example는 자동 로드하지 않습니다. 파일 저장은 사용자가 file 또는 both를 명시한 경우만 켭니다.

DI가 만든 logger를 필요한 객체의 생성자에 주입해 사용합니다. 예를 들어 `await logger.info('operationStarted', { traceId })`, `await logger.error('operationFailed', error, { scope, requestId })`처럼 호출합니다. event는 camelCase 식별자이며 자유 형식 메시지·업무 payload·환경 객체는 받지 않습니다. scope·traceId·requestId는 1~128자의 영문/숫자로 시작하는 식별자이며 영문·숫자·점·밑줄·콜론·하이픈만 허용합니다. 식별자에도 비밀값·개인정보를 넣지 마세요.

initialize 전에 기록하면 실패하며 initialize는 메인 DI가 호출합니다. logger는 모든 backend Service보다 먼저 초기화하고 통신·업무 객체 해제 후 마지막에 dispose합니다. 통신은 report(error, { scope })를 통해 기록하며 원래 통신 실패·공개 오류 응답은 유지합니다. 업무 코드에서 호출한 기록 Promise도 await하거나 명시적으로 오류를 처리해야 합니다.

## 개인정보·오류 경계

레코드는 한 줄 JSON(timestamp·level·event·제한된 context·정규화 error)이며 최대 16 KiB입니다. error 이름·제한된 code와 최대 4단계 cause를 기록하고 순환은 truncated로 표시합니다. 원래 message와 그에 해당하는 stack 머리 부분, URL 자격 증명·query가 있는 frame은 기록하지 않습니다. 위치만 확인할 수 있는 frame은 최대 16개로 제한합니다.

getter·toJSON은 호출하지 않습니다. 따라서 런타임이 Error.stack을 접근자로 제공하거나 오류 객체의 stack이 getter인 경우 해당 stack은 빠질 수 있습니다. 오류 객체 전체나 환경 설정 전체를 기록하지 않으며 raw 문자열 예외도 그대로 남기지 않습니다. stack 파일 경로는 내부 진단 정보이며 Bridge 응답으로 보내지 않습니다.

## 파일·큐·실패 처리

file/both는 소스·빌드 실행 모두 앱 루트 logs/를 사용합니다. app.log와 app.1.log~app.4.log를 각 1 MiB 이하로 회전합니다. 각 파일 첫 줄의 `{"logger":"typescript-composer","version":1}`은 관리 형식 표시입니다. 다른 파일·다른 형식·부분 기록·심볼릭 링크·하드 링크는 이어 쓰거나 덮어쓰지 않고 초기화에 실패합니다. POSIX에서는 디렉터리 0700·파일 0600이며 기존 파일 권한이 다르면 자동 기록을 거부합니다. 파일 로깅을 쓰면 /logs/를 앱 .gitignore에 직접 추가합니다.

한 앱 logs/에는 프로세스 하나만 기록합니다. 여러 앱 인스턴스가 같은 디렉터리를 공유하는 파일 로깅은 지원하지 않으며, 변경이 감지되면 실패할 수 있습니다. 콘솔만 쓰면 logs/를 만들지 않습니다. 관리 표시를 임의로 바꿔 사용자 파일을 Logger 파일로 위장하지 마세요. 실패한 기존 logs/는 내용을 보존해 원인을 확인하고 사용자 판단으로 별도 위치에 백업한 뒤 다시 시작합니다.

쓰기 큐는 최대 256개이며 직렬 처리합니다. 큐 초과·권한·디스크·콘솔 출력 오류를 가짜 성공으로 바꾸지 않습니다. 쓰기 실패는 원인을 보존해 이후 flush/dispose에서도 전달합니다. 통신 report의 실패는 한 번의 일반화한 stderr 안내와 flush/dispose 실패로 드러내며, 처리되지 않은 rejection이나 로깅 재귀를 만들지 않습니다.

dispose는 새 접수를 막고 이미 접수한 기록을 flush한 뒤 파일을 닫습니다. flush는 기록 API의 쓰기 완료를 기다리며 fsync·정전 복구·강제 종료 시 미완료 기록 보존을 보장하지 않습니다. 실제 검증 절차는 docs/validation/loggerValidation.md를 따릅니다.

## 업무에서 기록하기

createDi() 내부에서 logger를 생성하고 필요한 Usecase·Service의 생성자에 직접 전달합니다. 업무 객체가 di 전체를 참조하지 않도록 합니다. 아래는 초기화가 끝난 업무 처리 위치의 호출 예시입니다.

```ts
// 파일: src/backend/usecases/<feature>/<feature>.usecase.ts
// 적용: 의존성을 주입받은 업무 메서드 내부에 추가합니다. logger와 업무 함수는 앱이 제공합니다.
await logger.info('operationStarted', { scope: 'worker' });
try {
  await performOperation(); // 앱의 실제 업무 함수
} catch (error) {
  await logger.error('operationFailed', error, { scope: 'worker' });
  throw error;
}
```

performOperation과 logger는 앱이 제공하는 의존성입니다. 기록 실패도 원래 업무 오류와 함께 보존해야 하는 위치에서는 AggregateError로 두 오류를 전달합니다. 비동기 오류 콜백에서는 report(error, context)를 사용할 수 있으며 업무 성공 여부를 logger 호출로 대체하지 않습니다. 종료는 di.dispose()에 맡기고 업무마다 logger.dispose()를 호출하지 않습니다.

## 적용 방식

Compose는 이 기능이 표준 구성의 필수 연결인 경우만 자동 포함합니다. 그 외에는 기능 원본의 files/에서 필요한 파일을 직접 복사하고 패키지·설정·앱 DI를 수동 연결합니다. feature add는 제공하지 않습니다. 추가 객체는 createDi 내부의 지역 변수로 만들고 필요한 Usecase·Service·Bridge의 생성자에 직접 전달합니다. 추가 기능을 사용하기 위해 DI 반환값의 instances 목록을 확장하거나 업무 코드에서 DI 전체를 조회하지 않습니다. 기능 매니페스트는 생성하지 않으며 di.ts를 직접 수정합니다.

추가 외부 패키지는 없습니다. 기본 구성의 런타임과 공통 코드를 사용합니다.

설정 키: `LOGGER_LEVEL`, `LOGGER_OUTPUT`. 키의 설명·비밀값 구분은 아래 설정 절과 환경 양식을 확인합니다.

공통 수동 연결 절차는 Composer 원본 `components/03-features/README.md`에 있습니다.

### 수동 생성에 필요한 원본

- `src/backend/services/logger/logger.service.ts`의 `createLoggerService` 사용. 생성자/factory 의존성: `{}`. 수명 메서드: initialize, dispose.

파일 출력을 쓰는 앱은 `.gitignore`에 `/logs/`를 직접 추가합니다. logger 초기화 전에 파일 기록을 시작하지 않습니다.

### 패키지와 환경 양식

추가 외부 패키지는 없습니다. Node 기본 API와 복사한 공통 코드를 사용합니다.

.env.example에 필요한 키만 직접 추가합니다. AUTO_START 키는 기본 생성기가 더 이상 읽지 않으므로 필요하면 앱 DI에서 readAutoStart로 직접 연결합니다.

```dotenv
# 파일: .env.example
# 적용: 필요한 키만 추가합니다. 실제 값은 사용자 .env 또는 OS 환경에 작성합니다.
# debug/info/warn/error. 기본 info
LOGGER_LEVEL=
# console/file/both. 기본 console. file/both 명시 시 앱 logs/에 회전 저장
LOGGER_OUTPUT=
```

## DI에 추가할 코드

```ts
// 파일: src/backend/core/di.ts
// 추가 위치 1: 기존 import 아래에 추가합니다.
import { createLoggerService } from '../services/logger/logger.service.ts';

// 추가 위치 2: createDi()에서 기존 features 생성 직후에 추가합니다.
const logger = createLoggerService();
features.lifecycleEntries.unshift({
  name: 'logger', dependencies: [],
  initialize: () => logger.initialize(),
  dispose: () => logger.dispose(),
});
// logger를 사용하는 다른 LifecycleEntry의 dependencies에 'logger'를 추가합니다.
// Usecase 생성 시 new XxxUsecase(logger)처럼 필요한 객체에만 전달합니다.
// 통신 factory의 onError에는 error => logger.report(error)를 주입합니다.
// 기존 return createRuntime(features, appEntries)는 유지합니다.
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
| logger | Composer v0.0.0 | 추가 패키지 없음 | YYYY-MM-DD | src/backend/core/di.ts | docs/logger.md |

<!-- 기능 코드를 앱에서 수정하면 아래 변경 기록도 실제 내용으로 추가합니다. -->
### 기능 변경 기록

- YYYY-MM-DD: logger — 추가 또는 수정한 내용, 실제 검사 결과와 미검증 범위
```

기능 추가만으로 package.json의 앱 version을 임의로 변경하지 않습니다. 앱 릴리스 정책에 따라 버전을 변경할 때 README 기록과 package-lock.json도 함께 맞춥니다. 실제 .env·키·토큰·로그·node_modules·dist는 저장하지 않습니다.

## Logger를 주입받는 Usecase 전체 예시

```ts
// 파일: src/backend/usecases/operation/runOperation.usecase.ts
// 적용: 문서용 새 파일 예시입니다. 실제 업무 이름과 작업으로 교체합니다.
import type { LoggerService } from '../../services/logger/logger.service.ts';

export class RunOperationUsecase {
  private readonly logger: Pick<LoggerService, 'info' | 'error'>;
  private readonly operation: () => Promise<void>;
  constructor(logger: Pick<LoggerService, 'info' | 'error'>, operation: () => Promise<void>) {
    this.logger = logger;
    this.operation = operation;
  }
  async execute(): Promise<void> {
    await this.logger.info('operationStarted', { scope: 'operation' });
    try { await this.operation(); }
    catch (error) {
      try { await this.logger.error('operationFailed', error, { scope: 'operation' }); }
      catch (loggingError) {
        throw new AggregateError([error, loggingError], 'Operation and logging failed', { cause: error });
      }
      throw error;
    }
  }
}
```

```ts
// 파일: src/backend/core/di.ts
// 추가 위치 1: 기존 import 아래입니다.
import { RunOperationUsecase } from '../usecases/operation/runOperation.usecase.ts';

// 추가 위치 2: createDi 내부에서 기존 logger와 실제 업무 Service를 만든 뒤입니다.
// operationService는 앱이 구현한 업무 Service이며 문서에서 가짜 구현을 추가하지 않습니다.
const runOperation = new RunOperationUsecase(logger, () => operationService.run());
// 업무 Bridge 생성자에 runOperation을 전달합니다.
// logger initialize 완료 후 Bridge 또는 작업 진입점에서 await runOperation.execute()를 호출합니다.
```

로그 기록 실패가 업무 실패를 덮어쓰지 않도록 두 오류를 보존합니다. 업무 Usecase는 DI 전체가 아니라 필요한 logger 메서드와 실제 업무 함수만 받습니다.
