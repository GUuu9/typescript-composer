# UDP 사용자 검증

이번 구현의 설치·타입·단위·loopback·실제 연결·제한시간 검사는 에이전트가 실행하지 않았습니다. Node 24.22.1 이상, 패키지 레지스트리 접근, 별도 임시 앱을 사용하세요. 기존 project/ 앱은 검사 대상으로 사용하지 않습니다.

## Composer 조립 검사

Composer 저장소 루트에서 실행합니다.

```sh
node --test test/composition.test.mjs test/communicationExpansion.test.mjs
```

기대 결과: 표준 6개 구성의 허용/금지·필수 통신, Socket.IO의 HTTP 단일 인스턴스·시작 순서와 SOCKET_IO_AUTO_START 접두사, MQTT 수동 시작 선택, Electron의 필수 IPC가 유지됩니다.

## 임시 앱 생성과 설치·타입·기본 검사·빌드

Composer 루트에서 실행합니다. 소스 출력·독립 Git 초기화만 수행합니다.

```sh
node --input-type=module <<'JS'
import { mkdtemp, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { generateProject } from './scripts/generate.mjs';
const parent = await realpath(await mkdtemp(path.join(os.tmpdir(), 'composer-udp-')));
const { app } = await generateProject({ parent, name: 'validation', selection: { configuration: 'typescript-backend', communications: ['udp'] }, verify: false });
console.log(app);
JS
```

출력된 앱 경로로 이동해 다음을 실행합니다.

```sh
npm run verify
```

기대 결과는 설치 → 전체 check → 기본 test → build 통과와 상태 활성화입니다. MQTT의 외부 브로커 검사는 기본 test에서 제외됩니다. 기본 검사 통과는 실제 외부 연결·부하·GUI 성공을 의미하지 않습니다.

실패하면 소스·package-lock·.composer/diagnostic.json을 보존하고 실패 단계 원인을 확인한 뒤 `npm run verify`로 재시도합니다. state나 원본 해시는 직접 고치지 않습니다. 실제 .env는 사용자가 선택 키만 작성하고 비밀값은 커밋하지 않습니다.

## 실제 실행과 추가 확인

앱 경로에서 설정을 작성한 뒤 `npm start`로 빌드 결과, `npm run dev`로 개발 실행을 확인합니다. 정상 중단·Ctrl+C 이후 포트/구독·타이머·자식 프로세스가 남지 않아야 합니다. 아래 확인은 별도로 직접 진행하고 결과를 기록합니다.

- 기본 udp.test.ts는 loopback 전송·1200-byte 제한·Bridge 등록/해제·중단/재시작·최종 해제 후 시작 거부를 검사합니다. 실패한 단일 검사만 다시 실행할 때는 `node --test test/backend/udp.test.ts`를 사용합니다.
- 외부 망 확인은 사용자 관리 peer의 IP를 UDP_ALLOWED_PEERS에 지정하고 양쪽에 토큰을 설정한 뒤 같은 envelope로 전송합니다. 신뢰하지 않는 IP·잘못된 토큰·UTF-8 오류·1201 bytes 이상·미등록 route는 업무를 호출하거나 자동 응답하면 안 됩니다. 자동 응답은 없으므로 테스트 Bridge의 호출 기록 또는 내부 onError 콜백으로 확인합니다.
- 사용자 임시 검사 Bridge가 처리 완료를 보류하도록 해 16개 처리 뒤 초과 수신이 버려지는지, 30초 경과 뒤에도 실제 완료 전 처리 자리가 반환되지 않는지 확인합니다. stop 5초 초과는 실패여야 하며 늦은 결과·재전송은 없어야 합니다.
- 전송 성공만으로 수신/업무 성공을 기록하지 않습니다. 손실·중복·순서 변경을 허용하고 멱등성은 실제 업무 테스트에서 확인하세요. 외부 bind는 토큰과 정확한 peer 목록이 없으면 시작 전에 거부되어야 합니다.
