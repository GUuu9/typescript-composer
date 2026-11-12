# Logger Service

Node backend·Electron Main의 선택 Service입니다. compose의 추가 기능에서 logger를 선택하면 같은 인스턴스를 DI에 등록하고 선택 통신의 onError를 연결합니다. 웹 단독·renderer에는 추가하지 않으며 전역 예외·원격 수집·frontend 전송을 자동 설치하지 않습니다.

## 설정·사용

앱 루트 .env의 LOGGER_LEVEL은 debug/info/warn/error(기본 info), LOGGER_OUTPUT은 console/file/both(기본 console)입니다. OS 환경이 우선하고 .env.example는 자동 로드하지 않습니다. 파일 저장은 사용자가 file 또는 both를 명시한 경우만 켭니다.

DI가 만든 logger를 필요한 객체의 생성자에 주입해 사용합니다. 예를 들어 `await logger.info('operationStarted', { traceId })`, `await logger.error('operationFailed', error, { scope, requestId })`처럼 호출합니다. event는 camelCase 식별자이며 자유 형식 메시지·업무 payload·환경 객체는 받지 않습니다. scope·traceId·requestId는 1~128자의 영문/숫자로 시작하는 식별자이며 영문·숫자·점·밑줄·콜론·하이픈만 허용합니다. 식별자에도 비밀값·개인정보를 넣지 마세요.

initialize 전에 기록하면 실패하며 initialize는 메인 DI가 호출합니다. logger는 모든 backend Service보다 먼저 초기화하고 통신·업무 객체 해제 후 마지막에 dispose합니다. 통신은 report(error, { scope })를 통해 기록하며 원래 통신 실패·공개 오류 응답은 유지합니다. 업무 코드에서 호출한 기록 Promise도 await하거나 명시적으로 오류를 처리해야 합니다.

## 개인정보·오류 경계

레코드는 한 줄 JSON(timestamp·level·event·제한된 context·정규화 error)이며 최대 16 KiB입니다. error 이름·제한된 code와 최대 4단계 cause를 기록하고 순환은 truncated로 표시합니다. 원래 message와 그에 해당하는 stack 머리 부분, URL 자격 증명·query가 있는 frame은 기록하지 않습니다. 위치만 확인할 수 있는 frame은 최대 16개로 제한합니다.

getter·toJSON은 호출하지 않습니다. 따라서 런타임이 Error.stack을 접근자로 제공하거나 오류 객체의 stack이 getter인 경우 해당 stack은 빠질 수 있습니다. 오류 객체 전체나 환경 설정 전체를 기록하지 않으며 raw 문자열 예외도 그대로 남기지 않습니다. stack 파일 경로는 내부 진단 정보이며 Bridge 응답으로 보내지 않습니다.

## 파일·큐·실패 처리

file/both는 소스·빌드 실행 모두 앱 루트 logs/를 사용합니다. app.log와 app.1.log~app.4.log를 각 1 MiB 이하로 회전합니다. 각 파일 첫 줄의 `{"logger":"typescript-composer","version":1}`은 관리 형식 표시입니다. 다른 파일·다른 형식·부분 기록·심볼릭 링크·하드 링크는 이어 쓰거나 덮어쓰지 않고 초기화에 실패합니다. POSIX에서는 디렉터리 0700·파일 0600이며 기존 파일 권한이 다르면 자동 기록을 거부합니다. /logs/는 선택 시 앱 .gitignore에 추가됩니다.

한 앱 logs/에는 프로세스 하나만 기록합니다. 여러 앱 인스턴스가 같은 디렉터리를 공유하는 파일 로깅은 지원하지 않으며, 변경이 감지되면 실패할 수 있습니다. 콘솔만 쓰면 logs/를 만들지 않습니다. 관리 표시를 임의로 바꿔 사용자 파일을 Logger 파일로 위장하지 마세요. 실패한 기존 logs/는 내용을 보존해 원인을 확인하고 사용자 판단으로 별도 위치에 백업한 뒤 다시 시작합니다.

쓰기 큐는 최대 256개이며 직렬 처리합니다. 큐 초과·권한·디스크·콘솔 출력 오류를 가짜 성공으로 바꾸지 않습니다. 쓰기 실패는 원인을 보존해 이후 flush/dispose에서도 전달합니다. 통신 report의 실패는 한 번의 일반화한 stderr 안내와 flush/dispose 실패로 드러내며, 처리되지 않은 rejection이나 로깅 재귀를 만들지 않습니다.

dispose는 새 접수를 막고 이미 접수한 기록을 flush한 뒤 파일을 닫습니다. flush는 기록 API의 쓰기 완료를 기다리며 fsync·정전 복구·강제 종료 시 미완료 기록 보존을 보장하지 않습니다. 실제 검증 절차는 docs/validation/loggerValidation.md를 따릅니다.

## 업무에서 기록하기

createDi()의 반환값에서 di.instances.logger를 필요한 Service의 생성자에 전달합니다. 업무 객체가 di 전체를 참조하지 않도록 합니다. 아래는 초기화가 끝난 업무 처리 위치의 호출 예시입니다.

```ts
await logger.info('operationStarted', { scope: 'worker' });
try {
  await performOperation(); // 앱의 실제 업무 함수
} catch (error) {
  await logger.error('operationFailed', error, { scope: 'worker' });
  throw error;
}
```

performOperation과 logger는 앱이 제공하는 의존성입니다. 기록 실패도 원래 업무 오류와 함께 보존해야 하는 위치에서는 AggregateError로 두 오류를 전달합니다. 비동기 오류 콜백에서는 report(error, context)를 사용할 수 있으며 업무 성공 여부를 logger 호출로 대체하지 않습니다. 종료는 di.dispose()에 맡기고 업무마다 logger.dispose()를 호출하지 않습니다.
