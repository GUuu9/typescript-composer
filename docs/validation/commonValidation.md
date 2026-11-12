# 공통 구성품 재배치 검증

v0.0.0의 선택 검사 참고 자료입니다. 전체 실행은 완료 조건이 아니며 사용 중 문제 조사나 명시적 요청에 필요한 범위만 수행합니다. 미실행 결과를 통과로 기록하지 않습니다.

이번 재배치 후 기능 검사는 에이전트가 실행하지 않았습니다. 아래 명령은 사용자가 별도 터미널에서 실행합니다. 기존 `project/` 앱은 검증 대상으로 사용하지 않습니다.

## Composer 조립 확인

작업 경로는 Composer 저장소 루트이며 Node 24.22.1 이상이 필요합니다.

```sh
node --test test/composition.test.mjs test/verification.test.mjs test/environment.test.mjs test/electron.test.mjs
```

기대 결과: 6개 표준 구성에서 project 공통이 항상 포함되고 backend/frontend 공통은 선택 영역에서만 포함되고 React 단독·Phaser 결합은 react-common도 포함합니다. runtime은 backend-common이, target 교체용 DI는 해당 base/target이 소유합니다. 상태 활성화·재시도·환경 로딩 검사도 통과해야 합니다. electron-backend 단독 선택은 거부되고 대화형 마지막 6번은 electron-phaser여야 합니다.

## 새 임시 앱 설치·타입·테스트·빌드

같은 저장소 루트에서 다음을 실행하면 임시 경로에 6개 표준 구성의 새 앱을 출력합니다. 실제 설치와 검사는 다음 단계에서 개별 실행합니다.

```sh
node --input-type=module <<'JS'
import { mkdtemp, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { configurations } from './scripts/configurations.mjs';
import { generateProject } from './scripts/generate.mjs';
const parent = await realpath(await mkdtemp(path.join(os.tmpdir(), 'composer-common-')));
for (const entry of configurations) {
  const { app } = await generateProject({ parent, name: entry.id, selection: { configuration: entry.id, communications: entry.required.length ? entry.required : ['none'] }, verify: false });
  console.log(app);
}
JS
```

출력된 각 앱 경로로 이동해 실행합니다. 레지스트리 접근과 패키지 다운로드가 필요합니다.

```sh
npm run verify
```

기대 결과: install → check → test → build 성공 후에만 `.composer/state.json`이 활성화됩니다. 단독 웹에는 backend 파일이 없어야 하며 Node·Electron에서는 공통 runtime·환경 설정과 각 base의 실행 연결이 함께 검사되어야 합니다. GUI·실제 외부 연결 성공을 의미하지는 않습니다.

추가 프로세스 검증이 필요하면 Composer 루트에서 `npm run test:integration`(Node None 시작·감시·종료), `npm run test:http`(HTTP 조립·응답), `npm run test:web`(단독/복합 웹 실행)을 각각 실행합니다. 설치와 시간 제한 검사가 포함됩니다. Electron GUI·TCP 외부 연결 검증은 각 기능의 문서를 따릅니다.

실패하면 임시 앱의 소스·lock·진단을 보존하고 실패 단계와 로그를 확인합니다. 원본 경로·파일 소유권 오류는 생성기를 수정한 뒤 새 임시 앱으로 재확인하며, state 해시를 직접 수정하지 않습니다. 개별 설치·검사 실패는 해당 앱에서 원인을 해결한 뒤 `npm run verify`로 재시도합니다.
