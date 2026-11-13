# IPC Api 사용법

electron-app·electron-phaser의 필수 renderer Api입니다. Service에 공통 Api를 주입하고 `await api.get('/status', signal)`처럼 선언된 경로만 호출합니다. status는 설명용 경로이며 기본 업무 API가 아닙니다.

Main의 route 선언·Bridge, shared 직렬화 계약, 명시적 preload 메서드와 경로가 모두 연결되어야 합니다. 현재 업무 경로의 자동 추가 명령은 없으며 features.manifest나 ipcRoutes.manifest를 직접 바꿔 우회하지 않습니다. 새로운 경로는 기존 계약에 맞춘 수동 앱 연결 작업 또는 별도 구성품 작업으로 추가합니다.

AbortSignal은 renderer가 결과를 기다리고 반영하는 것을 중단합니다. Main 업무를 자동 취소하지 않습니다. 반환 unknown은 Service에서 검증하며 renderer에 ipcRenderer나 Node 접근을 공개하지 않습니다.

이 문서의 호출은 구조 설명이며 실제 업무 구현과 실행 검증을 포함하지 않습니다. 앱 루트에서 npm run check 후 선택 기능의 필요한 검사만 수행합니다.

## 적용 방식

Compose는 이 기능이 표준 구성의 필수 연결인 경우만 자동 포함합니다. 그 외에는 기능 원본의 files/에서 필요한 파일을 직접 복사하고 패키지·설정·앱 DI를 수동 연결합니다. feature add는 제공하지 않습니다. 추가 객체는 createDi 내부의 지역 변수로 만들고 필요한 Usecase·Service·Bridge의 생성자에 직접 전달합니다. 추가 기능을 사용하기 위해 DI 반환값의 instances 목록을 확장하거나 업무 코드에서 DI 전체를 조회하지 않습니다. 기능 매니페스트는 생성하지 않으며 di.ts를 직접 수정합니다.

추가 외부 패키지는 없습니다. 기본 구성의 런타임과 공통 코드를 사용합니다.

공통 수동 연결 절차는 Composer 원본 `components/03-features/README.md`에 있습니다.

### 수동 생성에 필요한 원본

- `src/frontend/apis/ipc.api.ts`의 `createIpcApi` 사용. 생성자/factory 의존성: `{}`. 수명 메서드: 통신 start·stop·dispose 또는 수명 없음.

## package.json과 README 버전 기록

이 기능만을 위해 package.json에 추가할 패키지는 없습니다. 빈 dependencies 항목이나 버전·명령을 임의로 추가하지 않습니다. Electron 기본 구성을 전제로 하며 일반 웹·Node 앱에 파일만 복사해 사용할 수 없습니다. 소스 복사만 했다면 패키지 설치 명령도 필요하지 않습니다.

아래 기록을 앱 README에 추가합니다. 최초 원본 기준은 v0.0.0이며 앱에서 수정했다면 실제 변경 내용·적용일을 함께 기록합니다. 기능 원본 버전과 npm 패키지 버전, 앱 자체 버전은 별개입니다. 적용 여부가 불명확한 상태를 완료로 기록하지 않습니다.

```md
<!-- 파일: README.md -->
<!-- 적용: 기존 기능·의존성 관리 절의 표에 아래 행을 추가합니다. -->
<!-- 적용일·연결 파일은 앱의 실제 값으로 작성하고, 기존 표가 없으면 제목과 표를 함께 추가합니다. -->
## 수동 추가 기능과 버전

| 기능 | 원본 기준 | 사용 패키지 | 적용일 | 연결 위치 | 사용법 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| ipc-client | Composer v0.0.0 | Electron 기본 구성 재사용 | YYYY-MM-DD | src/frontend/core/di/di.ts | docs/ipcClient.md |

<!-- 기능 코드를 앱에서 수정하면 아래 변경 기록도 실제 내용으로 추가합니다. -->
### 기능 변경 기록

- YYYY-MM-DD: ipc-client — 추가 또는 수정한 내용, 실제 검사 결과와 미검증 범위
```

기능 추가만으로 package.json의 앱 version을 임의로 변경하지 않습니다. 앱 릴리스 정책에 따라 버전을 변경할 때 README 기록과 package-lock.json도 함께 맞춥니다. 실제 .env·키·토큰·로그·node_modules·dist는 저장하지 않습니다.
