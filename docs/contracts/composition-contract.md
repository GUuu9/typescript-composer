<!-- version: v0.0.0 -->
# 공통 조립 계약

상태: 사용자 승인된 구현 계약입니다. 공통 선언·계획 검증과 Node·React·Electron·Phaser의 표준 6개 구성을 구현했으며 사후 추가는 별도 요청 시 구현하며 현재 제공하지 않습니다. 생성 명령은 사용자 지시에 따라 인자 없는 npm run compose의 대화형이며 구성·기능 질문 후 프로젝트 이름을 마지막에 받습니다. 비대화형 CLI와 feature 명령은 아직 제공하지 않습니다.

## 1. 선택 목록

구현 시 구성 목록 하나를 대화형·비대화형 입력 검증과 생성 계획에서 함께 사용합니다. 문서의 표는 그 목록의 요구사항입니다. 미구현 행은 선택 시 미지원 오류를 반환하고 Node None으로 대체하지 않습니다.

모든 행에 공통 구성품을 포함합니다. HTTP는 backend 수신과 frontend 발신을 구별하고, 통신 선택은 실행 영역별로 기록합니다.

| 구성 | base | 기본·필수 연결 | 허용 추가 연결 |
| :--- | :--- | :--- | :--- |
| typescript-backend | node-backend | None 또는 통신을 명시적으로 선택 | backend HTTP·TCP·UDP·MQTT·Socket.IO |
| web-app | frontend | None | frontend 외부 HTTP |
| web-phaser | phaser | None | frontend 외부 HTTP |
| backend-webui | node-backend + frontend | backend HTTP 필수·통합 제공 | backend TCP·UDP·MQTT·Socket.IO |
| electron-app | electron-backend + frontend | Main–React IPC 필수 | Main HTTP·TCP·UDP·MQTT·Socket.IO |
| electron-phaser | electron-backend + phaser | Main–Phaser IPC 필수 | Main HTTP·TCP·UDP·MQTT·Socket.IO |

None은 정규화된 통신 목록이 비어 있는 상태이며 별도 구성품이 아닙니다. 입력에서 None과 통신 동시 명시는 거부합니다. 필수 통신은 제거하지 못하고 자동 시작합니다. Socket.IO의 HTTP 의존은 동일 인스턴스로 연결합니다. Service·util은 선언된 영역·프레임워크·선행 구성품으로 제한하고 저장은 기본 포함하지 않습니다.

## 2. 구성품 선언

각 구성품 루트에 `compose.json`을 둡니다. `files/`의 파일 목록은 실제 디렉터리에서 수집하고 아래 선언은 소유권 예외와 조립 정보를 담습니다. 앱의 명시적인 scripts 외에 생성 중 실행할 임의 hook이나 평가할 JavaScript를 선언하지 않습니다.

| 필드 | 형식·의미 |
| :--- | :--- |
| schemaVersion | 지원 스키마 정수. 첫 버전은 1 |
| id | 구성품의 고유 공개 식별자. 위치와 별개로 중복 거부 |
| version | 구성품 버전 문자열. 변경 확인은 파일 해시도 사용 |
| kind | common·base·target·feature 중 하나 |
| areas | backend·frontend·preload·shared 중 포함 영역 |
| frameworks | node·electron·react·phaser 중 필요한 실행 기반. 공통은 빈 배열 |
| requires | 선행 구성품 id 배열. 자동 포함 후 누락·순환·호환성 검사 |
| packages | dependencies·devDependencies의 패키지명과 정확한 버전 |
| scripts | 생성 앱 package.json의 명령 이름과 명령문 |
| environment | 공개 설정 키별 description·required·secret 메타데이터. 실제 값 없음 |
| filePolicies | 앱 상대 경로별 user·generated 소유권. 생략 시 user |
| replaceableFiles | base가 target 교체를 허용하는 연결 파일 경로 배열 |
| replacements | target이 교체할 경로와 기존 소유 구성품 id 배열 |
| registrations | 아래 객체 생성·주입·수명 선언 배열. 없으면 빈 배열 |
| communications | HTTP 계약의 별도 통신 등록 배열. 없으면 빈 배열 |

배열·객체의 빈 값은 허용하며 선택 필드는 생략 시 빈 값으로 정규화합니다. 필수는 schemaVersion·id·version·kind·areas입니다. 알 수 없는 필드·지원하지 않는 스키마·잘못된 enum은 오류입니다. framework는 호환 조건이며 이를 보고 base를 임의로 추가하지 않습니다. requires로 필요한 base를 명시합니다.

패키지는 같은 이름·같은 버전·같은 의존성 구분이면 합칩니다. 다른 버전 또는 dependencies/devDependencies 간 중복은 거부합니다. 명령도 같은 이름·같은 내용만 합칩니다. 환경 키는 메타데이터가 같을 때만 합치며 .env.example에는 공개 키와 설명만 출력합니다. 실제 환경 변수는 state·로그에 저장하지 않습니다. package.json과 .env.example는 생성기가 모아 출력하며 files/에서 중복 제공하지 않습니다. 공통 원본은 .env.example를 복사하지 않고 생성기가 선택된 선언으로 출력합니다. 사용자 요청에 따라 Node 앱은 시작 시 앱 루트의 .env를 읽되 기존 OS 환경 변수를 우선합니다. 실제 .env는 자동 생성·수정하지 않으며 실행 값은 state에 기록하지 않습니다.

파일 경로는 앱 루트 내부의 정규화된 상대 경로만 허용합니다. 절대 경로·상위 이동·역슬래시·심볼릭 링크·대소문자만 다른 경로·파일/디렉터리 충돌을 거부합니다. .git·node_modules·dist·release·실제 .env·개인 키는 입력 파일로 허용하지 않습니다. 모듈 경로와 교체 경로에도 같은 검사를 적용합니다.

## 3. 파일 소유권과 계획

순서는 공통 → 선택 base → target → feature입니다. 같은 단계의 선행 구성품은 위상 정렬하고 동순위는 id 순서로 고정합니다. 뒤 단계에 의존하는 앞 단계 구성품은 거부합니다. 모든 파일·패키지·등록 검사는 출력 전에 완료합니다.

동일 경로는 내용이 같아도 충돌입니다. 예외는 크기가 0인 `.gitkeep`과 명시적 target 교체뿐입니다. target은 base의 replaceableFiles와 자신의 replacements가 모두 일치하는 파일만 교체합니다. feature의 교체 선언은 거부합니다. 최종 파일 소유자는 교체한 target이며 이전 소유자도 계획에 기록합니다.

| 대상 | 소유권과 추가 시 처리 |
| :--- | :--- |
| DI·진입점·업무 소스·문서·일반 설정 | user. 처음 복사한 뒤 자동 재작성하지 않음 |
| features.manifest.ts | generated. baseline과 다르면 변경 전 충돌 |
| package.json·.env.example | 항목별 병합. 새 항목만 추가하고 기존 직접 충돌은 중단 |
| package-lock.json | npm이 생성. 추가 실패 시 이전 바이트로 복구 |
| .composer/state.json | 도구 관리. 파싱·스키마·경로 검증 후 사용 |

base는 이후 연결을 위한 고정 매니페스트 호출 지점을 처음부터 DI에 둡니다. target 교체는 최초 생성에만 적용하며 사후 추가 때 사용자 파일을 교체할 권한이 되지 않습니다. 사용자 DI·설정 변경이 필요한 추가는 수동 적용 안내로 전환합니다.

## 4. 객체 생성과 수명 등록

registrations의 각 항목은 다음 필드를 사용합니다. 문자열 코드를 삽입하지 않고 검증한 식별자·경로로 타입 검사 가능한 호출 코드를 생성합니다.

| 필드 | 의미 |
| :--- | :--- |
| name | 영역 내부 고유 camelCase 등록 이름 |
| area | backend 또는 frontend. preload 노출은 별도 보안 연결 구현에서 결정 |
| module | files/ 안의 앱 소스 상대 모듈 경로 |
| factory | 해당 모듈의 명명 export 식별자 |
| dependencies | factory 인자 객체의 키 → 같은 영역의 등록 이름 매핑 |
| lifecycle | initialize·dispose 중 필요한 동작 배열. 수명 없으면 빈 배열 |

factory는 동기적으로 객체를 만들고 외부 자원을 열지 않습니다. 인자가 없으면 빈 객체를 전달합니다. 생성 매니페스트는 의존 순서대로 factory를 한 번 호출하고, 같은 객체를 의존 주입과 수명 등록에 사용합니다. 생성 매니페스트가 제공하는 `createFeatures()`를 메인 di가 호출합니다. 반환값은 `instances`(이름별 객체)와 `lifecycleEntries`(순서가 정해진 같은 객체 참조)입니다. Node None의 등록 목록은 비어 있습니다. HTTP는 별도의 communicationEntries에 같은 인스턴스의 start·stop·dispose를 연결하며 일반 Service 수명 dispose와 중복 등록하지 않습니다. 자동 시작 환경 플래그를 먼저 확인하고 자동 대상의 연결 설정은 객체 생성 전에 검증합니다. 수동 대상은 start 직전에 설정을 검증합니다.

factory 반환 타입은 객체로 제한합니다. 선언한 initialize/dispose는 호출 가능한 메서드여야 하며 생성 코드의 타입 검사로 검증합니다. 등록 이름·factory 식별자는 코드 생성에 안전한 식별자만 허용하고 예약어와 중복을 거부합니다. 누락 의존성·순환·영역 간 직접 객체 주입도 거부합니다. 구성품 requires와 객체 dependencies는 별도로 검사합니다.

`core/lifecycle/lifecycle.contract.ts`의 타입은 `Initializable.initialize(): void | Promise<void>`와 `Disposable.dispose(): void | Promise<void>`입니다. Service는 필요한 타입만 import type으로 참조합니다. 기능 통신의 start/stop은 이 수명 타입에 포함하지 않고 후속 통신 계약으로 구분합니다.

수명 관리자는 `initialize(): Promise<void>`·`dispose(): Promise<void>`를 제공합니다. 초기화 중 중복 호출은 같은 진행 작업을 기다립니다. dispose 후 initialize는 거부합니다. 초기화 중 dispose 요청은 다음 초기화·실행 시작을 막고 현재 초기화 완료 또는 실패를 기다린 뒤 정리합니다. 강제 취소나 타임아웃을 암묵적으로 제공하지 않습니다.

실패 시 생성된 객체 중 dispose가 선언된 객체를 역순 정리합니다. 실패한 초기화의 객체와 초기화 전 생성된 객체도 포함하므로 dispose는 미초기화 상태를 처리해야 합니다. factory가 반환 전에 확보한 자원의 정리는 해당 factory 책임이며 외부 자원 확보는 initialize로 미룹니다. 정리 오류가 있어도 나머지 정리를 계속하고 원래 오류와 정리 오류를 AggregateError로 보존합니다. 중복 dispose는 같은 결과를 기다리며 실패한 정리를 성공으로 바꾸거나 자동 재시도하지 않습니다.

앱 전용 객체는 메인 di에서 같은 관리자로 명시 등록합니다. 생성 등록과의 이름 충돌·누락·순환도 준비 전에 검사합니다. None 진입점은 설정 확인 → DI 생성 → initialize → 사용자 작업 위치 → finally dispose 순서이며 빈 업무 클래스나 대기 루프를 넣지 않습니다. 종료 요청이 준비 중 도착하면 작업을 시작하지 않습니다.

## 5. 상태와 사후 추가

`.composer/state.json`의 필드는 schemaVersion·composerVersion·configuration·components·files·managedEntries입니다.

- configuration: 표준 구성 id, 제공 방식, 실행 영역별 정규화 통신 선택과 자동 시작 여부.
- components: 활성 구성품 id·version·관련 선언과 입력 파일의 SHA-256. 전체 원본 해시는 차단 조건으로 사용하지 않음.
- files: 앱 상대 경로별 소유 구성품 id·user/generated 구분·생성 바이트의 SHA-256 baseline.
- managedEntries: 생성기가 추가한 패키지·명령·환경 키의 공개 기준값. 실제 비밀 설정은 포함하지 않음.

사용자 파일의 baseline은 덮어쓰기 권한을 부여하지 않습니다. state는 무결성 인증서가 아니며 현재 파일·선언·패키지·등록을 함께 검사합니다. 수동 적용 확인도 전체 사용자 코드를 baseline에 흡수하지 않습니다.

최초 생성은 기존 목적지에 쓰지 않습니다. 실패 시 소스·lock·진단을 보존하고 완료 단계와 재실행 방법을 안내합니다. 검증 전 state를 기록해야 하면 활성 components는 비워 두고 검증 대상을 별도 `pendingComponents`에 기록합니다. install/check/test/build 성공 후 활성 상태로 전환합니다. npm run verify 재실행은 소스를 재출력하지 않고 install/check/test/build 전체를 반복합니다. 검증 단계의 완료 캐시는 두지 않습니다. 실패 단계·취소는 활성 상태로 표시하지 않습니다.

추가는 부모 components의 관련 원본과 호환성을 확인하고 쓰기 전 충돌 검사를 마칩니다. 적용 전 변경 대상 소스·package/lock·state의 원래 바이트와 존재 여부를 보관합니다. 실패하면 기존 파일을 복원하고 새 파일만 제거하며 원래 없던 lock도 원복합니다. node_modules·산출물·설치 외부 부작용은 복구하지 않습니다. 성공 시에만 활성 구성과 해당 변경의 baseline을 기록합니다. state 저장은 같은 디렉터리 임시 파일을 만든 뒤 rename하며 저장 실패도 추가 실패로 처리합니다.

사용자가 변경한 매니페스트·패키지·환경 항목의 직접 충돌은 수동 안내로 전환합니다. 수동 적용 확인 실패는 사용자 작업과 기존 활성 state를 보존합니다. feature add 체계는 기존 계획을 따르며 새로운 확인 하위 명령과 신규 생성 CLI 인자는 별도 계약으로 확정합니다.

## 6. 구현 범위와 검사 기준

현재 조립 대상은 typescript-backend의 None/HTTP, web-app의 None/HTTP, backend-webui의 통합 제공와 Electron backend·React 결합 및 Phaser 웹·Electron입니다. 실제 canvas·WebGL·Electron GUI 검증은 별도로 남겨 둡니다. 사후 추가는 보호 구조를 설계하며 실제 명령은 별도 요청 시 구현합니다.

| 검사 대상 | 필수 사례 |
| :--- | :--- |
| 선택 | 6개 구성의 허용·금지·필수 조건, None 배타성, 미구현 선택 거부 |
| 선언·계획 | 스키마·경로·누락·순환·파일/패키지/명령/환경/등록 충돌, target 교체 범위, 빈 .gitkeep 중복 |
| 수명 | 의존 순서·공유 객체·부분 실패·정리 오류·중복 호출·초기화 도중 종료·dispose 후 초기화 거부 |
| Node None | 임시 새 앱 생성·Git init·install/check/test/build·빌드 결과 실행·정상 종료·개발 감시 종료 |
| 보호 | 기존 목적지 거부·사용자 파일 보존·원본 누락·state 검증·실패 단계 보존 |

현재 Node None은 TypeScript 7.0.2·@types/node 24.19.2를 고정하고 Node 자체 TypeScript 실행·--watch·내장 테스트를 사용합니다. 의존성 설치는 --ignore-scripts로 실행합니다. CLI 흐름과 실제 검증 범위는 루트 README.md에 기록합니다. 사후 추가의 복구·수동 확인은 별도 요청 시 구현합니다. 전체 조합 실행은 필요 시 수행하는 검사이며 현재 완료 조건이 아닙니다.

웹 확장은 web-contract.md를 따릅니다. base의 영역 명령을 target이 최상위 check/test/build/dev/start로 조립하고, frontend 발신 HTTP는 수신 통신 등록 대신 Api 객체 등록으로 표현합니다. frontend 매니페스트는 frontend/core/di/features.manifest.ts에 생성합니다.

Phaser 확장은 phaser-contract.md를 따릅니다. frontend 선택 시에만 common → frontend-common → react-common → 선택 base 순서로 수명·Api·Vite 기반을 조립합니다. 영역 명령은 frontend-common으로 공유하고 React 공용 renderer plugin·Provider·TSX 설정은 react-common이, 최종 진입점·타입 설정 연결·게임 코드는 선택 base가 소유합니다. 생성 매니페스트 소유자도 선택 base를 기록합니다.

Electron 확장은 electron-contract.md를 따릅니다. compose.json의 ipcRoutes는 path·method·channel·registration 목록이며 고유 경로/메서드/채널/Bridge와 선택 IPC 의존성을 검사합니다. 같은 Bridge 인스턴스를 Main 매니페스트에서 등록하고, 직렬화 메타데이터만 shared/ipcRoutes.manifest.ts에 생성합니다. 이 파일은 생성기 소유로 보호하며 renderer/preload에 Main 구현을 포함하지 않습니다.

TCP 확장은 tcp-contract.md를 따릅니다. communications의 선택 failure: true는 해당 인스턴스의 Promise<never>를 CommunicationEntry에 연결합니다. 수명 관리자는 시작 전·시작 중·실행 중 치명적 실패를 관찰하고 Node·Electron 진입점이 실패 종료하도록 전달합니다. 같은 TCP 객체를 일반 수명 dispose에도 중복 등록하지 않습니다. TCP의 자체 설정·네트워크·Bridge 소유권은 다른 통신과 분리하고 업무 객체만 DI에서 공유합니다.

## 공통 원본의 영역 분리

`00-common/project`(`common`)·`00-common/backend`(`backend-common`)·`00-common/frontend`(`frontend-common`)는 각각 compose.json과 files/를 소유합니다. project는 항상, backend/frontend는 선택한 영역에서만 조립합니다. backend 공통은 Node·Electron의 환경·수명·runtime·검사·TS 기반을 공유하며, target 교체 대상인 DI와 실행 연결 파일은 각 base에 유지합니다. 모든 앱에서 쓰는 TypeScript·Node 타입 개발 도구는 project 선언이 소유합니다. 기존 생성 앱과 state는 이번 원본 재배치로 수정하지 않습니다.

Phaser 구성의 React UI·게임 호스트·공용 DI 및 수명 분리는 [React·Phaser 계약](phaser-contract.md)을 따릅니다. react-common은 React 단독과 Phaser 결합의 Provider·React 패키지·TSX·Vite plugin을 공유하며 최종 main과 게임 코드는 선택 base가 소유합니다.

UDP·MQTT·Socket.IO는 [통신 확장 계약](communication-expansion-contract.md)을 따릅니다. Socket.IO 선택은 http를 중복 없이 포함하고 자동 시작 의존성은 선택 검증과 환경 적용 양쪽에서 확인합니다. config/수명/JSON 경계 공통 코드는 backend-common이 소유하며 각 feature는 통신 구현·설정·docs·검사를 소유합니다. 실제 외부 연결은 사용자 검증 대기입니다.

선택 Service의 첫 구성품 logger는 [Logger 계약](logger-contract.md)을 따릅니다. 기능 목록은 configurations.mjs의 optionalFeatures에서 영역별로 제한합니다. logger 선택 시 계획에서 통신의 onError 의존성을 추가하고 생성 매니페스트가 동일 인스턴스의 report 콜백으로 연결합니다. 다른 backend 수명 항목은 logger 이후 initialize·이전 dispose하도록 파생 의존성을 명시합니다. 사용자 di/업무 코드는 재작성하지 않습니다. /logs/ 제외는 logger 선택 때만 생성 앱의 공통 .gitignore에 병합하고 state에는 최종 생성 파일 해시를 기록합니다.
