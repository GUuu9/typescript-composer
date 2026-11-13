<!-- version: v0.0.0 -->
# 공통 조립 계약

## 생성 범위

Compose는 표준 6개 구성의 틀과 필수 연결만 생성합니다. typescript-backend·web-app·web-phaser는 통신 없이, backend-webui는 필수 HTTP와 frontend Api, Electron 결합은 Main·창·preload·필수 IPC를 포함합니다. 구성 → 프로젝트 이름 → 확인 순서이며 선택 기능 메뉴는 없습니다.

추가 기능은 [수동 기능 계약](manual-features-contract.md)에 따라 파일·패키지·환경·DI를 직접 연결합니다. feature add·자동 병합·복구 명령은 제공하거나 향후 구현 대상으로 두지 않습니다.

## 원본과 출력 계획

공통 → base → target → 필수 feature 순서로 조립합니다. 구성 목록은 configurations.mjs에서 공유합니다. compose.json은 기본 구성의 영역·패키지·명령·환경·객체 등록·필수 통신을 선언합니다. 수동 추가 기능에는 자동 조립 선언을 두지 않습니다.

파일은 선택 영역에만 포함합니다. 미선택 backend·frontend·preload는 생성하지 않습니다. 같은 빈 .gitkeep은 허용하고 나머지 파일·패키지·명령·환경·등록 충돌은 출력 전에 거부합니다. target 교체는 base가 허용한 연결 파일에만 적용하며 feature의 무조건 덮어쓰기는 금지합니다.

경로는 앱 내부 정규화 상대 경로만 허용합니다. 상위 이동·절대 경로·심볼릭 링크·대소문자 경로 충돌·실제 .env·키·.git·산출물은 원본 입력에서 거부합니다. 객체 의존성은 누락·중복·순환·영역 혼용을 검사합니다.

## 초기 DI와 사용자 수정

최초 생성 시 필수 객체의 factory 호출과 의존성·수명 연결을 backend/core/di.ts 또는 frontend/core/di/di.ts 안에 출력합니다. features.manifest.ts는 생성하지 않습니다. 초기 생성 함수는 같은 DI 파일 내부 구현이며 생성 이후 DI는 사용자 소유입니다. 사용자는 동일 파일에서 import·객체 생성·주입·수명 등록을 추가합니다.

factory는 외부 자원을 열지 않고 필요한 의존성만 받습니다. 동일 인스턴스를 업무 의존성과 수명 관리자에 연결합니다. Service는 LifecycleEntry, 통신은 CommunicationEntry를 사용하며 통신 dispose를 일반 Service 수명에도 중복 등록하지 않습니다. 앱별 초기 연결의 실제 작성 방법은 기능 docs를 따릅니다.

초기화는 의존 순서, 해제는 역순입니다. 초기화 실패·초기화 중 종료·부분 확보·중복 해제는 공통 수명 관리자에서 처리하며 원래 오류와 정리 오류를 보존합니다. 선언된 수명 메서드의 실제 타입은 앱 check에서 검사합니다. 강제 취소·지연 초기화·빈 수명 메서드는 기본 제공하지 않습니다.

Electron의 ipcRoutes.manifest.ts는 초기 경로 목록입니다. 이는 DI 기능 자동 추가 파일과 별개이며 새 업무 IPC 경로는 Main·shared·preload·Api를 함께 수동 연결합니다. 범용 ipcRenderer 노출은 금지합니다.

## 상태와 verify

.composer/state.json은 최초 구성·원본 버전·파일 소유권과 생성 기준값·패키지/명령/환경 기준을 기록합니다. schemaVersion은 1입니다. 실제 .env·비밀값은 기록하지 않습니다. 사용자 DI와 수동 추가 기능을 자동 갱신하거나 활성 상태에 흡수하지 않습니다.

활성 components는 검증 전 비우고 pendingComponents에 생성 대상을 기록합니다. npm run verify는 소스를 재출력하지 않고 install/check/test/build를 반복하며 성공 후에만 활성화합니다. 생성된 기능 파일의 해시 변경을 이유로 사용자 DI 수정을 막지 않습니다. 기존 관리 패키지·명령 기준 확인은 유지되므로 수동 변경이 필요하면 해당 진단을 확인하고 원래 계약 변경 여부를 판단합니다. state를 직접 수정해 우회하지 않습니다.

생성 실패·취소는 소스·lock·진단을 보존하고 재실행 방법을 안내합니다. 기존 목적지는 덮어쓰지 않습니다. 원자적 상태 저장은 임시 파일과 rename을 사용합니다. 사용자 데이터·기존 project 앱은 검사나 이행 대상으로 사용하지 않습니다.

## 명령·문서·검사

dev는 개발 실행, start는 빌드 결과이며 웹 preview는 운영 서버가 아닙니다. 복합 구성은 필수 프로세스의 종료와 재시작을 관리합니다. backend build는 해당 backend/shared 산출물만 정리합니다. 실제 .env는 사용자가 작성하고 OS 환경을 우선합니다.

원본 설명은 components/README.md, 웹·Electron·Phaser·HTTP와 수동 통신의 상세 보안·수명은 각 계약을 따릅니다. 기능 문서에는 복사할 파일·패키지·환경·DI·Usecase 사용·README 버전 기록·필요한 검사 절차를 둡니다.

기본 확인은 구문·JSON·diff 검사입니다. 설치·타입·기능·외부 연결·GUI 결과를 구분하며 미실행 검사를 통과로 기록하지 않습니다. 검증 범위는 update.md에 실제 수행한 내용만 기록합니다.
