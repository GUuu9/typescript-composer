# 추가 기능 수동 적용

Compose는 표준 구성과 필수 연결만 생성합니다. 추가 통신·Service는 이 원본에서 필요한 파일을 직접 복사하고 앱에서 연결합니다. feature add 명령과 자동 패키지·환경·등록 병합은 제공하지 않습니다.

1. 해당 기능의 files/ 아래 소스와 docs를 앱의 같은 상대 경로로 복사합니다. 기존 파일은 덮어쓰지 말고 변경 내용을 직접 비교합니다.
2. 기능별 문서의 패키지·환경 키를 확인하고 앱 package.json과 .env.example에 필요한 항목만 직접 추가합니다. 실제 .env는 사용자만 작성합니다.
3. 공통 config·util·수명 계약 import가 가리키는 파일도 확인합니다. Node/Main 기능은 backend가 없는 웹 앱에 복사하지 않습니다.
4. 앱의 core/di.ts에서 factory로 객체를 생성하고 Bridge와 필요한 의존성만 주입합니다. features.manifest.ts는 생성하지 않으며 di.ts를 직접 수정합니다.
5. 선택 통신은 직접 만든 CommunicationEntry를 앱 runtime에 전달해 시작·종료·failure를 연결합니다. Service는 LifecycleEntry로 initialize/dispose를 연결합니다. logger는 다른 Service보다 먼저 초기화하고 마지막에 해제되도록 dependencies를 지정합니다.
6. 외부 API는 frontend Service에 Api를 주입합니다. 사용하지 않는 기능을 기본 DI에 추가하지 않습니다.

Node/Main의 기존 createDi 내부는 di.ts 내부 초기 구성 반환값을 createRuntime에 전달합니다. 수동 객체를 만들고 반환값의 communicationEntries·lifecycleEntries에 추가한 뒤 createRuntime을 호출하면 동일 수명 관리자를 재사용할 수 있습니다. 객체는 실제 앱 DI에서 소유하고 다른 업무에는 필요한 객체만 전달합니다. renderer의 createDi는 별도 frontend 수명 계약을 따릅니다.

```ts
// 파일: src/backend/core/di.ts
// 추가 위치 1: 기존 import 아래에 추가합니다.
import { createTcpCommunication } from '../communications/tcp/tcp.communication.ts';
import { readTcpConfig } from '../config/tcp.config.ts';

// 추가 위치 2: createDi() 내부의 기존 features 생성 직후에 추가합니다.
const tcp = createTcpCommunication({});
const tcpConfig = readTcpConfig();
// 업무 Bridge가 있다면 tcp.registerBridge(bridge)를 여기에서 호출합니다.
features.communicationEntries.push({
  name: 'tcp', autoStart: true,
  start: () => tcp.start(tcpConfig),
  stop: () => tcp.stop(), dispose: () => tcp.dispose(), failure: tcp.failure,
});
// 기존 return createRuntime(features, appEntries)는 유지합니다.
```

features는 기존 createDi 내부 변수입니다. Bridge는 앱이 준비하며 logger가 필요하면 factory의 onError에 report 호출을 주입합니다. 이 예시는 자동 생성 결과가 아니며 기본 createDi에 tcp가 노출된다고 가정하지 않습니다. backend 공통 타입에 맞춰 communicationEntries를 CommunicationEntry[]로 유지합니다.

설정은 loadEnvironment 후 읽습니다. Socket.IO는 HTTP 인스턴스를 주입하고 HTTP → Socket.IO 시작·역순 종료를 유지합니다. 실패를 단순 로그로 숨기지 않으며 오류 공개·토큰·Origin 제한은 각 기능 계약을 따릅니다. 복사 후 앱 루트의 npm run check와 필요한 기능 검사 절차를 참고합니다. 에이전트는 설치·전체 검사를 자동 실행하지 않습니다.

각 기능은 files/와 사용 문서로 전달합니다. 추가 기능에 새 compose.json·생성기 등록·선택 메뉴를 만들지 않습니다. HTTP·IPC 등 필수 구성용 원본 선언만 Composer가 사용합니다.

## 앱 README에 패키지 기록

코드 블록은 파일 경로와 추가 위치를 첫 주석에 표시합니다. 아래는 앱 설명에 병합할 양식이며 기능에 맞는 실제 값으로 작성합니다.

```md
<!-- 파일: README.md -->
<!-- 적용: 사용 기능·패키지 절에 추가합니다. 기존 설명은 유지합니다. -->
## 추가 기능과 패키지

| 기능 | 패키지 | 연결 위치 | 사용법 |
| :--- | :--- | :--- | :--- |
| 사용한 기능명 | 실제 패키지명·버전 또는 Node 내장 | src/backend/core/di.ts | docs/기능문서.md |
```

경로에 <feature>가 있거나 앱 의존성이 생략된 코드는 부분 구조 예시입니다. 해당 파일에 넣을 때 실제 기능명·import·생성자 인자를 준비합니다. 문서의 예시 업무를 기본 생성 코드에 넣지 않습니다.

각 기능 docs의 `package.json과 README 버전 기록` 절에 패키지 병합 코드와 기능 원본·패키지 버전·적용일·연결 위치 기록 양식을 제공합니다. 원본 기준 v0.0.0은 외부 npm 패키지 버전이나 앱 릴리스 버전과 구분합니다.

추가 기능의 객체는 createDi 내부에서 지역 변수로 생성하고 필요한 Usecase·Service·Bridge 생성자에 직접 주입합니다. 수명이 필요한 객체만 같은 수명 관리자에 등록합니다. 추가 기능 때문에 di.instances를 확장하거나 업무 객체에 DI 전체를 전달하지 않습니다. 기존 필수 HTTP·IPC·window·Api의 내부 연결은 유지합니다.

## 직접 주입하는 DI 작성 방식

```ts
// 파일: src/backend/core/di.ts
// 추가 위치 1: 기존 import 아래에 앱에서 작성한 Usecase를 가져옵니다.
import { createLoggerService } from '../services/logger/logger.service.ts';
import { RunOperationUsecase } from '../usecases/operation/runOperation.usecase.ts';

// 추가 위치 2: createDi 내부에서 기존 features 생성 후 추가합니다.
const logger = createLoggerService();
features.lifecycleEntries.unshift({
  name: 'logger', dependencies: [],
  initialize: () => logger.initialize(),
  dispose: () => logger.dispose(),
});
// operationService는 앱에서 이미 생성한 실제 업무 Service입니다.
const runOperation = new RunOperationUsecase(logger, () => operationService.run());
// runOperation을 호출할 업무 Bridge에 직접 전달합니다.
// 기존 통신 객체가 있는 경우: http.registerBridge(createOperationBridge(runOperation));
// 마지막의 기존 return createRuntime(features, appEntries)는 유지합니다.
// logger와 runOperation을 instances에 추가하지 않습니다.
```

RunOperationUsecase의 전체 예시는 logger/files/docs/logger.md에 있습니다. operationService와 업무 Bridge는 실제 기능 구현이며 이 예시가 기본 업무 코드를 생성하지 않습니다. 업무는 자신이 받은 의존성만 호출하고 di.instances.logger를 찾아 사용하지 않습니다.
