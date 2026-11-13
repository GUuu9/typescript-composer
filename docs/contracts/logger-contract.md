<!-- version: v0.0.0 -->
# 선택 Logger Service 계약

상태: 사용자 승인 계약입니다. 선택 Service로 제공하며 실제 검증 범위는 update.md에 기록합니다. 새 공개 명령이나 사후 추가 기능은 만들지 않습니다.

## 범위·선택·소유권

- 공개 기능 식별자는 logger입니다. typescript-backend·backend-webui·electron-app·electron-phaser의 backend/Main에서 선택하며 웹 단독·renderer에서는 제공하지 않습니다. frontend 로그의 HTTP/IPC 전송과 전역 예외 가로채기는 포함하지 않습니다.
- logger는 자동 선택하지 않습니다. files/ 소스를 복사하고 패키지·환경·DI·README 기록을 docs/logger.md에 따라 직접 적용합니다.
- 원본은 components/03-features/logger/files입니다. 외부 패키지 없이 사용자 DI에서 factory와 initialize/dispose를 직접 연결합니다.
- 앱 파일은 backend/services/logger/logger.service.ts·logger.model.ts, backend/config/logger.config.ts, test/backend/logger.test.ts, docs/logger.md·docs/validation/loggerValidation.md입니다. LoggerService와 createLoggerService(deps)를 같은 Service 파일에 둡니다. 순수 로그 정규화·비밀값 제거가 별도 파일을 필요로 할 때만 소유 기능의 util로 분리합니다.

## API·기록 내용

- LoggerService는 생성자 주입으로 설정과 출력 대상을 받습니다. debug(event, context?)·info·warn·error(event, error, context?)는 Promise<void>를 반환하며 호출자는 기록 실패를 확인할 수 있습니다. flush는 접수한 기록의 완료를 기다립니다.
- event는 camelCase 식별자입니다. 한 줄 JSON에 UTC timestamp·level·event·명시적으로 전달한 제한된 context·정규화한 error/cause 정보를 기록합니다. 레코드는 최대 16 KiB, cause 깊이는 최대 4이며 순환을 처리합니다.
- context는 scope·traceId·requestId 같은 추적 식별자만 허용하고 raw payload·request/response·설정 객체·환경 변수 전체를 받지 않습니다. 외부 입력과 업무 데이터를 통째로 직렬화하지 않습니다. getter·사용자 toJSON을 실행하지 않습니다.
- 자동 통신 오류 기록은 error 이름·제한된 code와 stack 위치·cause 구조를 사용합니다. 임의 error.message와 stack 첫 줄은 기본 자동 기록에서 제외해 URL·토큰·업무 데이터가 섞인 오류 문장을 그대로 저장하지 않습니다. 파일 경로가 포함된 stack 위치는 내부 진단용이며 공개 Bridge 응답에 전달하지 않습니다. 추가적인 업무 식별자도 호출자가 비밀값을 넣지 않아야 합니다.

## 통신·DI 연결

- 같은 logger 인스턴스를 메인 DI에 한 번 등록하고 필요한 Service에는 logger의 필요한 메서드만 주입합니다. 업무 객체가 di 전체를 참조하지 않습니다.
- 앱 DI가 통신 factory의 onError에 같은 logger.report를 직접 연결합니다. HTTP·TCP·UDP·MQTT·Socket.IO·IPC의 기존 함수형 onError도 계속 허용합니다. 생성자는 로그 파일을 열거나 통신을 시작하지 않습니다.
- 통신 콜백용 report(error)는 내부에서 error 기록을 요청하고 실패를 처리합니다. 실패한 기록은 일반화한 stderr 안내로 알리고 flush/dispose에서도 원인을 보존해 실패를 반환합니다. 처리되지 않은 Promise rejection이나 로깅 재귀를 만들지 않습니다. 통신의 원래 요청 실패·failure 전달을 로깅 성공 여부로 바꾸지 않습니다.
- logger.initialize → 나머지 Service 준비 → 통신 시작 순서를 따릅니다. 종료는 통신 해제와 업무 자원 해제 후 logger.dispose에서 flush하고 파일을 닫습니다. 종료 중 다른 Service가 마지막 로그를 기록할 수 있도록 logger 수명 순서를 명시합니다. 자동 uncaughtException·unhandledRejection 처리나 프로세스 강제 종료는 추가하지 않습니다.

## 환경·저장·제한

- LOGGER_LEVEL은 debug/info/warn/error이며 기본 info입니다. LOGGER_OUTPUT은 console/file/both이며 기본 console입니다. 실제 .env는 사용자가 작성하고 선택한 두 키의 설명만 .env.example에 넣습니다. OS 환경 우선과 .env.example 자동 로드 금지를 유지합니다.
- 파일 기록은 사용자가 LOGGER_OUTPUT=file 또는 both로 명시한 경우만 켭니다. 앱 루트 logs/ 아래 JSONL을 저장하고 경로를 임의 입력받지 않습니다. 파일 경로는 소스/빌드 위치가 바뀌어도 앱 루트 기준으로 같습니다.
- 파일은 app.log 및 회전 파일 app.1.log~app.4.log, 파일당 최대 1 MiB로 제한합니다. 크기 초과 전 회전하며 남은 회전 파일 수를 제한합니다. 디렉터리/파일의 심볼릭 링크를 거부하고 기존 사용자 파일을 임의로 덮어쓰지 않습니다. logger 관리 파일과 맞지 않는 항목이 있으면 초기화 전에 명확히 실패합니다. POSIX에서 디렉터리는 0700·파일은 0600을 사용하며 다른 OS 권한 성공을 단정하지 않습니다.
- 앱 .gitignore에 /logs/를 제외합니다. 콘솔 전용이나 미선택 상태에서는 logs/를 만들지 않습니다. 로그 보관·외부 수집·압축·일별 회전·별도 저장소는 추가하지 않습니다.
- 쓰기는 직렬화하고 대기 레코드는 최대 256개로 제한합니다. 큐 초과·디스크 오류·권한 오류를 가짜 성공으로 바꾸지 않습니다. dispose는 새 기록 접수를 중단하고 접수 기록을 flush한 뒤 파일을 닫으며 중복 호출을 합칩니다. OS 파일 쓰기의 강제 취소를 약속하지 않습니다. 중단 없는 프로세스 강제 종료 시 미완료 기록 보존도 보장하지 않습니다.

## 검사·문서와 남은 작업

선택 가능 영역·미선택 제외·DI 인스턴스 공유·통신 의존/종료 순서·JSON 경계·비밀값·순환 cause·파일 회전/권한·큐 초과·실패 전달·flush/dispose 검사 코드를 준비합니다. 실제 실행은 Phaser·통신과 같은 방식으로 docs/validation/loggerValidation.md에 새 임시 앱의 설치·check/test/build 명령·선행 조건·기대 결과·실패 대응을 남깁니다. 에이전트는 문법·JSON·diff만 직접 확인합니다.

기존 project/ 앱·state는 수정하지 않습니다. 점검 보고서에 남은 Electron 초기화 중 종료 전달과 TCP 단절 후 업무 추적 문제는 별도 수정 대상으로 유지하며 logger 추가로 해결됐다고 설명하지 않습니다.

파일 첫 줄은 Logger 관리 형식 표시이며 기존 파일을 확인한 뒤에만 이어 씁니다. 파일 쓰기는 한 logs/ 디렉터리에 프로세스 하나를 사용하는 범위입니다. 오류 stack이 getter로 제공되면 호출하지 않아 해당 위치 정보는 생략될 수 있습니다.
