# React·Phaser 사용자 검증

이번 React 결합 후 설치·타입·단위·빌드·화면 검사는 에이전트가 실행하지 않았습니다. Node 24.22.1 이상과 패키지 레지스트리 접근이 필요합니다. 기존 project/ 앱 대신 새 임시 앱에서 진행합니다.

## Composer 조립 검사

Composer 저장소 루트에서 실행합니다.

```sh
node --test test/composition.test.mjs test/phaser.test.mjs test/web.test.mjs test/electron.test.mjs
```

기대 결과: React 단독에는 Phaser가 없고 web-phaser에는 React·Phaser·Provider·게임 호스트가 함께 포함됩니다. electron-phaser의 필수 IPC와 Main 선택 HTTP도 유지됩니다. 게임 수명 대역 검사는 중복 생성·해제, 준비 중 해제, 재마운트 순서, 공유 Service 보존, 생성·정리 오류 전달을 확인합니다. 실제 React DOM·WebGL 검사는 아닙니다.

## 새 임시 앱 생성

Composer 루트에서 실행합니다. 소스 출력과 독립 Git 초기화만 수행하고 설치·검사는 다음 단계에서 실행합니다.

```sh
node --input-type=module <<'JS'
import { mkdtemp, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { generateProject } from './scripts/generate.mjs';
const parent = await realpath(await mkdtemp(path.join(os.tmpdir(), 'composer-react-phaser-')));
for (const configuration of ['web-phaser', 'electron-phaser']) {
  const { app } = await generateProject({ parent, name: configuration, selection: { configuration }, verify: false });
  console.log(app);
}
JS
```

출력된 각 앱 경로로 이동해 실행합니다.

```sh
npm run verify
```

기대 결과: install → check → test → build가 성공하고 상태가 활성화됩니다. TSX·React plugin·Phaser 설정과 선택 영역 전체가 검사됩니다. 실패 시 소스·lock·진단을 보존하고 원인을 해결한 뒤 같은 명령으로 재시도합니다. state 해시는 수정하지 않습니다.

## 화면과 수명

web-phaser 임시 앱 경로에서 `npm run dev`를 실행합니다. 브라우저에 표시되는 로컬 주소에서 canvas가 하나만 나타나고 창 크기에 맞춰지는지 확인합니다. main.tsx에서 React UI를 GameComponent의 형제로 배치해 UI 갱신이 Game을 다시 생성하지 않는지 확인합니다. 임시 앱에서 호스트 표시 상태를 바꿔 제거·재마운트해 canvas 중복·이벤트 잔류 없이 공유 Service가 유지되는지도 확인합니다.

Scene·컴포넌트·main 수정 후 HMR에서도 canvas는 하나여야 합니다. pagehide·복원·초기화 실패·초기화 중 종료에서 후속 Game이 시작되지 않고 자원이 정리되어야 합니다. 부트 ready가 발생하지 않는 Phaser 실패에는 강제 정리 만료가 없어 대기할 수 있습니다.

electron-phaser 임시 앱에서는 `npm run setup:electron` 후 `npm run dev`를 실행합니다. 로컬 React·canvas와 필수 IPC, 정상 빌드 후 재시작, 빌드 실패 시 기존 창 유지, Ctrl+C·창 닫기 후 프로세스 종료를 확인합니다. `npm start`는 이미 빌드한 결과를 실행합니다.

React 단독 회귀 확인은 Composer의 docs/validation/commonValidation.md에 따라 web-app·electron-app 새 임시 앱에서 진행합니다. 각 검사의 실제 실행 결과를 별도로 기록하며 타입·빌드 성공을 GUI 성공으로 간주하지 않습니다.
