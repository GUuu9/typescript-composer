# MQTT 사용자 검증

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
const parent = await realpath(await mkdtemp(path.join(os.tmpdir(), 'composer-mqtt-')));
const { app } = await generateProject({ parent, name: 'validation', selection: { configuration: 'typescript-backend', communications: ['mqtt'] }, verify: false });
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

자동 시작 전에 사용자가 .env에 MQTT_URL·MQTT_CLIENT_ID와 필요한 인증을 작성합니다. TLS 검사에는 사용자가 관리하는 유효한 mqtts 인증서가 필요하며 인증서 검증을 해제하지 않습니다. 테스트 전용 브로커·고유 client ID·전용 topic을 사용하고 기존 앱과 같은 client ID를 재사용하지 않습니다.

앱 경로에서 사용자 관리 브로커를 지정한 .env를 준비한 뒤 다음을 실행합니다. MQTT_TEST_TOPIC은 검사를 위해 사용 가능한 고유한 topic으로 바꾸세요. 명령은 그 topic에 JSON을 실제 발행합니다.

```sh
COMPOSER_MQTT_TEST=true MQTT_CLIENT_ID="composerCheck$$" MQTT_TEST_TOPIC="composer/validation/$$" node --env-file=.env --test --test-name-pattern='^slow:' test/backend/mqtt.test.ts
```

기대 결과: 연결·SUBACK → QoS 1 발행/브로커 ACK → 동일 topic 수신 → stop/start → 최종 해제 성공입니다. 기본 단위 검사만 다시 확인하려면 `node --test --test-skip-pattern='^slow:' test/backend/mqtt.test.ts`를 사용합니다.

추가로 브로커에서 구독을 거절하도록 설정해 시작 실패·정리를 확인하고, 실행 중 브로커를 중단해 failure → 통신/업무 자원 정리 → 앱 실패 종료를 확인합니다. 자동 재연결·오프라인 재발행은 없어야 합니다. plain mqtt는 암호화되지 않으며 mqtts의 잘못된 인증서는 거부되어야 합니다.

사용자 임시 Bridge에서 작업 완료를 보류해 16개 동시 처리·초과 수신 버림·30초 보고 이후 처리 자리 유지·stop 5초 실패를 확인합니다. 브로커 ACK를 지연시켜 발행 10초 실패와 실제 ACK/정리 전 발행 자리 유지를 확인합니다. JSON 오류·64 KiB 초과·wildcard·시스템 topic·잘못된 QoS는 업무 전 거부되어야 합니다. QoS 1 중복 수신은 업무 멱등성을 별도로 검사하세요.
