# HTTP 통신

Express 기반 HTTP/1.1 JSON 통신입니다. 기본 업무 API 없이 미등록 경로는 404 JSON을 반환합니다. 기본 업무 인증·저장·TLS·업로드·스트리밍은 포함하지 않습니다. CORS는 HTTP_ALLOWED_ORIGINS로 정확한 Origin을 허용하며 정적 제공은 backend-webui, WebSocket은 별도 Socket.IO 기능에서 연결합니다.

## 설정과 실행

.env.example를 .env로 복사하고 필요한 값을 작성합니다. 실제 .env는 Git에 저장하지 않습니다. OS 환경 변수가 우선하며 변경 후 앱을 재시작합니다. 빈 설정은 기본값으로 처리합니다.

| 키 | 값·기본값 |
| :--- | :--- |
| HTTP_HOST | IP 주소 또는 localhost. 기본 127.0.0.1 |
| HTTP_PORT | 정수 1~65535. 기본 3000 |
| HTTP_ALLOWED_ORIGINS | 추가 허용 HTTP(S) origin의 쉼표 목록. 기본 비어 있음, wildcard·null·계정 금지 |
| HTTP_AUTO_START | true 또는 false. 기본 생성 단계의 선택 |

npm run dev는 소스 실행·감시, npm run build 후 npm start는 빌드 결과 실행입니다. 기본 자동 시작 시 HTTP가 종료될 때까지 앱이 유지되고 Ctrl+C·SIGTERM으로 통신과 공유 자원을 정리합니다. HTTP_AUTO_START=false는 리스너 없이 객체만 준비합니다. 다른 유지 자원이 없으면 작업 완료 후 정상 종료합니다. 이후 앱 업무에서 DI의 같은 http 인스턴스에 start(config)를 호출할 수 있습니다. 테스트에서 직접 전달하는 config만 포트 0을 허용합니다.

## 등록과 수명

HTTP 객체는 생성 매니페스트가 한 번 생성하고 DI가 공유합니다. 객체 생성은 외부 자원을 열지 않습니다. Service initialize 이후 자동 통신을 시작하고, 종료는 통신 dispose 이후 공유 Service dispose 순서입니다. features.manifest.ts는 생성기 관리이므로 직접 수정하지 않습니다. 앱 전용 Bridge 객체는 DI에서 http.registerBridge(bridge)로 전달하며 통신은 업무 Bridge를 import하지 않습니다.

HttpBridge는 고유 camelCase name과 register(router) 메서드를 갖습니다. register에서 자신의 Express Router에 허용한 경로·메서드를 등록하고 외부 payload를 검증해 Usecase를 호출합니다. Router·Request·Response를 Usecase나 shared로 전달하지 않습니다. registerBridge의 반환 함수는 등록을 해제합니다. 등록·해제는 stopped에서만 가능하고 해제 함수는 중복 호출해도 안전합니다.

start(config)는 listen 완료까지 기다리며 같은 설정의 반복 호출은 중복 서버를 만들지 않습니다. 설정 변경은 stop 후 start로 적용합니다. stop은 네트워크만 닫고 Bridge·공유 Service를 유지합니다. dispose는 최종 해제이며 이후 start를 거부합니다. 준비 중 dispose도 시작이 정리된 뒤 완료합니다. listen 실패는 시도 자원을 정리하고 오류를 호출자에게 전달하며 이전 설정으로 자동 복원하지 않습니다.

## 오류·입력 경계

공개 오류는 error.code와 error.message만 포함합니다. 미등록 경로 404, 잘못된 JSON 400, 본문 초과 413, 지원하지 않는 본문·인코딩 415, 금지 Origin 403, 미처리 오류 500입니다. 내부 스택·경로·오류 원문은 응답에 넣지 않습니다. 생성 기본 오류 로그도 원문을 출력하지 않습니다. 앱 전용 DI에서 필요한 경우 createHttpCommunication의 onError에 내부 보고 함수를 주입할 수 있습니다. 이 콜백은 원본 오류를 받으므로 비밀값이 기록되지 않게 처리해야 합니다.

본문은 모든 Content-Type에서 최대 64 KiB로 제한합니다. 비어 있지 않은 비JSON 본문·압축 본문은 허용하지 않습니다. 헤더 최대 16 KiB, 헤더 수신 10초·전체 수신 30초·처리 30초 제한입니다. Node HTTP 파서가 거부한 헤더·framing의 400/431과 헤더 시간 초과 408은 JSON을 보장하지 않습니다. 이미 응답 헤더를 보낸 뒤 오류·시간 초과는 연결을 종료합니다.

Origin이 없는 요청, 요청 Host 기준 동일 origin과 HTTP_ALLOWED_ORIGINS의 정확한 origin만 허용합니다. 허용 응답은 해당 Access-Control-Allow-Origin과 Vary: Origin을 포함하며 credential은 허용하지 않습니다. preflight는 기본 HTTP 메서드와 Accept/Content-Type만 허용합니다. null·잘못된 형식·교차 origin은 거부합니다. Host·Origin 검사는 인증이나 접근 허용 목록을 대신하지 않습니다. 프록시 신뢰·교차 origin wildcard 허용은 기본으로 제공하지 않습니다.

## 중단 제한과 검증

stop은 신규 접수를 막고 진행 응답을 최대 5초 기다립니다. 초과하면 해당 소켓을 닫고 오류를 전달하며 실제 연결이 닫힌 경우 stopped 상태에서 다시 시작할 수 있습니다. 소켓 종료가 진행 중인 업무 Promise를 자동 취소하지는 않습니다. dispose 중 정리 오류가 나도 다른 통신·공유 자원을 정리하고 원래 오류와 정리 오류를 보존합니다.

npm test는 운영 서버·데이터 없이 loopback 임시 포트만 사용합니다. 기본 npm test는 포트 점유·재시작·등록 해제·잘못된 입력·정상 종료를 빠르게 검사합니다. 실제 5초 종료 유예·10/30초 시간 제한은 npm run test:slow로 필요할 때만 별도 실행합니다. 기본 검사에서 제외한 항목을 실행 완료로 기록하지 않습니다. 기본 테스트 성공은 외부 인터페이스·방화벽·운영 인증 설정 확인을 대신하지 않습니다.

## DI에서 연결하기

아래 코드는 앱별 DI 조립 위치에 넣는 구조 예시입니다. `di`는 createDi()의 반환값이며 예시의 `bridge`는 앱이 구현한 업무 Bridge입니다. 생성 매니페스트를 직접 편집하지 않습니다. DI에서 같은 Usecase 인스턴스를 필요한 Bridge에 주입하고 통신 시작 전에 등록합니다. 외부 payload의 실제 검증은 업무 Bridge/Service가 담당합니다.

```ts
const remove = di.instances.http.registerBridge(bridge);
// bridge: { name, register(router) { router.get('/api/...', handler); } }
await di.start();
// 종료는 통신과 업무 자원을 함께 정리합니다.
await di.dispose();
```

자동 시작을 끈 통신은 di.start()만으로 열리지 않습니다. 앱 실행이 유지되는 작업 위치에서 해당 통신의 start(config)를 호출합니다. 설정은 src/backend/config의 readHttpConfig를 사용하고 실제 .env의 값을 읽도록 앱 시작 시 loadEnvironment()를 먼저 수행합니다. stop()은 통신 중단, dispose()는 재시작할 수 없는 최종 해제입니다. 업무 완료 또는 앱 종료 시 di.dispose()를 호출하며 통신을 중단했다고 공유 업무 Service를 별도로 해제하지 않습니다. 등록 해제 함수는 통신을 중단한 뒤 호출합니다.
