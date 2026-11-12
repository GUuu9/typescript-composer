# MQTT 통신

MQTT.js 외부 브로커 client입니다. registerBridge({ name, topic, qos, handle(payload, message) })는 정확한 topic 하나를 구독하고 publish(topic, payload, qos)는 JSON을 발행합니다. QoS 0/1·clean session만 지원하며 wildcard·시스템 topic·retained 발행·브로커 내장·오프라인 큐·자동 재연결은 없습니다.

## 설정

MQTT_URL=mqtt/mqtts broker URL, MQTT_CLIENT_ID=고유한 1~64자 식별자, MQTT_USERNAME/MQTT_PASSWORD=선택 비밀값, MQTT_AUTO_START=true/false. URL에 자격 증명을 넣지 않으며 mqtts 인증서 검증을 해제하지 않습니다. URL/client ID는 자동 시작 또는 수동 start 전에 필요합니다.

앱 루트 .env를 사용하고 OS 환경을 우선합니다. 실제 .env는 사용자가 작성하며 .env.example는 실행 설정으로 자동 로드하지 않습니다. 비밀값을 커밋하지 않습니다. Node/Main에서만 제공하며 정적 frontend/client를 추가하지 않습니다.

## 수명과 제한

연결 및 모든 SUBACK 후 start가 완료됩니다. JSON 최대 64 KiB·동시 업무/발행 각 16개, 연결·구독·발행 10초·업무 30초·종료 유예 5초입니다. QoS 1 ACK는 브로커 수신이며 업무 성공·정확히 한 번 처리를 뜻하지 않습니다. 수신 초과는 보고 후 버리며 발행 초과는 실패합니다. 단절은 failure로 앱에 전달하며 재연결하려면 새 앱 실행이 필요합니다.

start(config)·stop()·dispose()는 직렬화하고 같은 설정 start는 중복 자원을 만들지 않습니다. 설정 변경 전에 stop을 호출합니다. Bridge 등록/해제는 stopped에서만 가능하며 반환한 해제 함수는 중복 호출해도 안전합니다. 통신은 업무 Bridge를 import하지 않고 DI가 연결하며 Bridge는 payload를 검증해 Usecase를 호출합니다. 실패를 성공으로 바꾸지 않고 원래 오류는 내부 onError 콜백으로 전달하며 기본 로그에는 상세 비밀값을 출력하지 않습니다.

stop은 공유 Service를 해제하지 않고 dispose 뒤에는 start를 거부합니다. 시간 제한·종료는 업무 Promise의 강제 취소가 아니며 늦은 결과는 외부로 보내지 않습니다. 수신/브로커의 치명적 장애는 failure로 앱 종료에 전달합니다. 실제 연결·보안·부하 성공은 아직 검증하지 않았습니다.

검증 명령·선행 조건·기대 결과·실패 대응은 docs/validation/mqttValidation.md를 따릅니다.

## DI에서 연결하기

아래 코드는 앱별 DI 조립 위치에 넣는 구조 예시입니다. `di`는 createDi()의 반환값이며 예시의 `bridge`는 앱이 구현한 업무 Bridge입니다. 생성 매니페스트를 직접 편집하지 않습니다. DI에서 같은 Usecase 인스턴스를 필요한 Bridge에 주입하고 통신 시작 전에 등록합니다. 외부 payload의 실제 검증은 업무 Bridge/Service가 담당합니다.

```ts
di.instances.mqtt.registerBridge(bridge);
// bridge: { name, topic: 'app/status', qos: 1, handle(payload, message) }
await di.start();
await di.instances.mqtt.publish('app/status', { version: 1 }, 1);
```

자동 시작을 끈 통신은 di.start()만으로 열리지 않습니다. 앱 실행이 유지되는 작업 위치에서 해당 통신의 start(config)를 호출합니다. 설정은 src/backend/config의 readMqttConfig를 사용하고 실제 .env의 값을 읽도록 앱 시작 시 loadEnvironment()를 먼저 수행합니다. stop()은 통신 중단, dispose()는 재시작할 수 없는 최종 해제입니다. 업무 완료 또는 앱 종료 시 di.dispose()를 호출하며 통신을 중단했다고 공유 업무 Service를 별도로 해제하지 않습니다. 등록 해제 함수는 통신을 중단한 뒤 호출합니다.
