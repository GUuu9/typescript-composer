# Logger 사용자 검증

구현 후 설치·타입·단위·파일 기록·회전·통신·GUI 검사는 에이전트가 실행하지 않았습니다. Node 24.22.1 이상과 패키지 레지스트리 접근이 필요합니다. 기존 project/ 앱 대신 새 임시 앱에서 수행합니다.

## Composer 선택·조립

Composer 저장소 루트에서 실행합니다.

```sh
node --test test/logger.test.mjs test/composition.test.mjs test/communicationExpansion.test.mjs
```

기대 결과: backend/Main에서만 logger가 선택되고 미선택 시 logger 파일·환경·등록이 빠집니다. 생성 명령은 기능을 선택한 뒤 프로젝트 이름을 받습니다. 통신별 onError는 동일 logger.report에 연결되며 logger는 먼저 initialize하고 마지막 dispose합니다. 선택 시에만 앱 .gitignore에 /logs/가 추가됩니다. 테스트는 새 임시 앱만 생성하며 실제 의존성 설치·통신 연결은 하지 않습니다.

## 새 임시 앱·설치·타입·기본 검사·빌드

Composer 루트에서 다음을 실행합니다. 소스 출력과 독립 Git 초기화만 진행합니다.

```sh
node --input-type=module <<'JS'
import { mkdtemp, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { generateProject } from './scripts/generate.mjs';
const parent = await realpath(await mkdtemp(path.join(os.tmpdir(), 'composer-logger-')));
const { app } = await generateProject({ parent, name: 'validation', selection: {
  configuration: 'typescript-backend', communications: ['none'], features: ['logger'],
}, verify: false });
console.log(app);
JS
```

출력한 앱 경로로 이동해 실행합니다.

```sh
npm run verify
```

기대 결과: install → check → test → build 후 상태가 활성화됩니다. logger.test.ts는 콘솔·레벨·입력 제한·getter 미실행·cause 순환·오류 문장 제외·관리 파일 회전·심볼릭 링크/사용자 파일 보호·큐 초과·쓰기 실패·flush/dispose를 임시 경로에서 확인합니다. 이미 설치·기본 검사한 상태에서 수정 범위를 다시 확인할 때만 `node --test test/backend/logger.test.ts`를 실행합니다.

실패하면 소스·lock·.composer/diagnostic.json과 실패한 로그를 보존합니다. 원인을 수정한 뒤 같은 앱에서 `npm run verify`로 재시도하고 state/baseline을 직접 수정하지 않습니다. 실제 .env는 사용자가 작성하며 비밀값·logs/는 커밋하지 않습니다.

## 실제 기록·환경

동일한 새 앱 경로에서 다음을 실행합니다. 코드가 만드는 DI의 initialize/dispose를 사용합니다. 예제 이벤트는 검사 명령에만 있으며 기본 앱 업무 코드에 추가되지 않습니다.

```sh
LOGGER_OUTPUT=both LOGGER_LEVEL=debug node --input-type=module <<'JS'
import { createDi } from './dist/backend/core/di.js';
const di = createDi();
try {
  await di.start();
  await di.instances.logger.info('validationStarted', { traceId: 'manual-check' });
  await di.instances.logger.error('validationFailed', new Error('must-not-be-recorded'));
  await di.instances.logger.flush();
} finally { await di.dispose(); }
JS
git check-ignore logs/app.log
```

기대 결과: JSON 콘솔 출력과 logs/app.log에 이벤트가 남고 원래 오류 문장은 빠집니다. 파일 첫 줄은 관리 형식이고 나머지는 한 줄 JSON입니다. POSIX에서는 `stat -f '%Lp %N' logs logs/app.log`(macOS) 또는 `stat -c '%a %n' logs logs/app.log`(Linux)로 700/600을 확인합니다. 콘솔 출력만 검사할 때는 별도의 새 임시 앱에서 LOGGER_OUTPUT=console로 같은 명령을 실행하고 logs/가 생기지 않는지 확인합니다.

## 통신·수명·장애 확인

별도 새 임시 앱에 실제 사용할 통신과 logger를 함께 선택하고 각 통신의 검증 문서를 따릅니다. logger에는 scope와 안전한 오류 정보가 남아야 하고 공개 응답에는 내부 stack·경로·비밀값이 없어야 합니다. 통신·업무 객체의 dispose에서 남긴 마지막 기록도 Logger 종료 전에 저장되는지 확인합니다. Electron의 IPC 검사는 실제 Electron 프로세스로 구분하며 일반 Node에서 Main DI를 import하지 않습니다.

복수 기록·회전은 프로세스 하나에서 검사합니다. 테스트는 1 MiB에 가까운 관리 파일을 만들어 회전·5개 보존·바이트 제한을 확인합니다. 다른 프로세스와 파일을 공유하는 부하 시험을 지원 성공으로 해석하지 않습니다.

별도 임시 경로에만 권한 오류·디스크/콘솔 쓰기 실패·잘린 레코드·알 수 없는 파일·파일/디렉터리 심볼릭 링크를 준비해 초기화/기록/flush/dispose 실패와 기존 내용 보존을 확인합니다. Logger가 기록 실패를 반복 로깅하거나 전역 예외 처리기로 재귀하지 않아야 합니다. Windows 파일 권한·링크 동작, 실제 디스크 고갈·강제 종료·전원 장애와 모든 통신/GUI 조합은 별도 미검증 범위입니다.
