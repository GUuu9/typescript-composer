<!-- version: v0.0.0 -->
# Phaser 웹·Electron 구현 계약

상태: 사용자 승인 계약입니다. 구현·실제 검증 범위는 update.md에 기록합니다.

## 지원 범위

- web-phaser: React UI와 Phaser 게임 frontend를 함께 생성합니다. 기본 None이며 외부 HTTP Api를 명시적으로 선택할 수 있습니다. backend·preload는 포함하지 않습니다.
- electron-phaser: 기존 Electron Main·보안 창·preload와 Phaser frontend를 조립합니다. IPC는 필수 자동 시작이며 Main의 HTTP·TCP·UDP·MQTT·Socket.IO는 선택할 수 있습니다.
- Phaser는 4.2.1로 고정하며 기존 TypeScript·Vite 버전은 유지합니다. React Provider·TSX·Vite plugin은 react-common에서 공유하고 게임 전용 코드는 Phaser base에 둡니다.
- 게임 규칙·예제 자산·샘플 데이터·저장·물리 엔진·업무 Service는 기본 생성하지 않습니다.

## 시작과 Scene·DI

frontend/main.tsx가 앱 DI 생성 → 필수 Service 초기화 → React Provider·화면 표시 순서로 시작하고 GameComponent가 게임 호스트를 통해 Phaser Game을 생성합니다. 초기화 실패나 시작 중 종료 요청이 있으면 Game을 시작하지 않고 확보한 자원을 정리합니다.

frontend/core/game.config.ts·scene.registry.ts를 사용하고, 최소 Scene은 frontend/scenes/game/game.scene.ts의 GameScene으로 둡니다. 기본 Scene에는 불필요한 빈 preload/create/update 메서드나 입력·네트워크 요청을 넣지 않습니다. 기본 화면은 800×600 canvas를 컨테이너에 맞춰 표시합니다. 접근 가능한 이름과 canvas 대체 설명을 제공합니다.

DI의 객체 생성·주입·수명과 공통 Api 계약을 재사용합니다. Scene 등록 지점이 필요한 Service만 생성자로 주입하며 Scene·Service에 DI 전체를 넘기지 않습니다. 기본 Scene에는 업무 의존성이 없으므로 가짜 의존성 타입이나 빈 Service를 만들지 않습니다.

Scene 종료는 해당 Scene의 이벤트·구독을 정리하는 경계이고 공유 Service 해제를 호출하지 않습니다. 게임 호스트 해제·재마운트는 Game의 입력·실행·canvas만 정리하고 이전 정리 후 새 Game을 생성합니다. 앱 종료·pagehide·HMR에서는 React 화면 → Game → 앱 공유 자원 순서로 중복 정리를 합칩니다. Phaser의 destroy 요청이 다음 frame에 처리될 수 있다는 점을 고려해 이전 게임의 실행이 새 게임이나 해제된 Service를 계속 사용하지 않도록 합니다. 숨겨진 페이지·초기화 중 종료도 별도 검사 대상으로 둡니다.

## 통신·환경·Electron 보안

HTTP는 기존 HttpApi·PUBLIC_API_BASE_URL 계약, IPC는 기존 IpcApi와 명시적 preload 메서드·등록 매니페스트 계약을 사용합니다. None에서는 Api를 강제로 생성하지 않고 기본 Scene은 선택 통신을 임의 호출하지 않습니다.

.env/.env.example와 OS 환경 변수 우선순위, 브라우저에 공개 API 주소만 전달하는 규칙을 유지합니다. 새 Phaser 환경 키는 추가하지 않습니다. Electron의 창·발신자 검증·sandbox·CSP·로컬 산출물 접근 제한을 유지하고 Phaser 실행을 이유로 unsafe-eval·임의 외부 연결을 허용하지 않습니다.

## 명령·조립·검증

기존 dev/start/check/test/build 명령을 재사용하며 새 공개 CLI 명령은 추가하지 않습니다. web-phaser는 Vite 개발·빌드 결과 preview, electron-phaser는 로컬 Main/preload/frontend 빌드와 성공한 빌드 후 앱 재시작 기준을 따릅니다. 산출물은 기존 dist/frontend 및 Electron 산출물 경로입니다.

React와 Phaser가 함께 쓰는 수명·Api·빌드 기반은 공유하되 framework 전용 파일과 의존성은 선택한 경우만 포함합니다. HTTP/IPC client의 호환 조건은 React 전용에서 공통 frontend로 확장하고 실행 기반별 매니페스트 소유자를 정확하게 기록합니다. feature의 파일 덮어쓰기는 허용하지 않습니다.

에이전트는 문법·JSON·diff만 확인하고 설치·타입·빌드·단위 검사도 사용자 직접 실행 절차로 남깁니다. Node 테스트에서 Phaser DOM/WebGL이나 Electron Main을 import하지 않습니다. 실제 브라우저 canvas·WebGL·Electron GUI·전체 조합·긴 종료 검사는 별도 터미널 실행 절차를 안내하고 결과 전 미검증으로 기록합니다. 기존 project/는 검사·수정 대상으로 사용하지 않습니다.

근거: 이 문서의 Scene·DI·실행 수명 기준과 승인된 웹·Electron 계약, [Phaser 공식 배포 목록](https://phaser.io/download/phaser4), [Game 수명 API](https://docs.phaser.io/api-documentation/class/game).

구현 주의: Phaser 4.2.1 배포 .d.ts의 TypeScript 7 오류 때문에 Phaser frontend에만 skipLibCheck=true를 적용합니다. 소스·테스트 strict 검사는 유지하지만 .d.ts 내부 검사는 생략되며 버전 갱신 시 재검토합니다.

## React 결합 세부 기준

## 구성과 책임

- 표준 구성은 6개를 유지합니다. web-phaser·electron-phaser에 React UI와 Phaser 게임 기반을 함께 포함하고 새 공개 구성명·선택 명령은 추가하지 않습니다. React만 필요한 경우 web-app·electron-app을 선택합니다.
- React는 앱 화면·메뉴·폼·게임 주변 UI를 담당하고 Page → ViewModel → Service → Api 구조를 유지합니다. 기본 생성에는 업무 화면·메뉴 예제를 넣지 않습니다.
- Phaser는 canvas·Scene·게임 루프를 담당합니다. React 렌더링마다 Game을 재생성하지 않으며 React 상태 갱신과 Scene update 루프를 직접 묶지 않습니다.
- 게임 호스트는 frontend/components/game/game.component.tsx에 둡니다. React UI와 canvas를 별도 영역으로 배치할 수 있으며 React가 소유한 호스트 안에서 Phaser가 canvas만 관리합니다. 기존 최소 GameScene과 Scene 등록·게임 설정을 재사용합니다.

## 원본 조립

- frontend-common은 프레임워크 독립 DI·수명·Api를 유지합니다. React Provider·개발 도구·TSX 설정은 React 공용 구성품으로 분리해 React 단독과 Phaser 결합에서 함께 사용합니다.
- React와 Phaser base의 main·index.html·renderer 설정을 무조건 겹쳐 복사하지 않습니다. 공용 React 구성품은 재사용 가능한 부분만 소유하고 최종 진입점과 빌드 연결은 선택 base가 소유합니다.
- React/Vite plugin과 Phaser 의존성은 compose.json으로 선언합니다. Phaser 4.2.1과 기존 skipLibCheck 적용 범위는 유지합니다. Node 전용 구성에는 React·Phaser를 포함하지 않습니다.

## DI와 수명

- 앱에서 DI를 한 번 만들고 필수 Service 초기화가 끝난 뒤 React 화면을 표시합니다. React Provider와 Scene 등록은 같은 업무 객체를 공유하되 Scene에는 필요한 의존성만 주입합니다.
- 앱 DI의 초기화·최종 해제와 게임 인스턴스의 생성·해제를 분리합니다. 게임 호스트의 해제는 해당 Game·입력·이벤트·canvas만 정리하고 앱 공유 Service를 해제하지 않습니다.
- 호스트 재마운트·개발 갱신에서는 이전 Game의 정리가 끝난 뒤 새 Game을 시작합니다. 앱 종료에서는 화면과 Game을 정리한 뒤 공유 자원을 해제합니다. 초기화 중 종료·중복 종료·부분 실패 시 기존 오류 보존 규칙을 유지합니다.
- React↔Scene 업무 연결은 필요한 Service·명시적 데이터 계약으로 구성하며 전역 이벤트 버스·예제 상태·임의 DI 접근 API는 기본 추가하지 않습니다.
