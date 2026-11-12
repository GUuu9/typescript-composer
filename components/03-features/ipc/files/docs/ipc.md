# Electron IPC 사용법

Electron 결합 구성에서 필수로 포함되며 IPC 보안은 환경 변수로 해제할 수 없습니다. Main DI가 생성한 ipc 인스턴스는 살아 있는 예상 창·frame·페이지와 payload 제한을 검사합니다.

업무 Bridge는 `{ route, handle() }` 형태이며 route는 shared의 path·method·channel 선언과 일치해야 합니다. 통신 시작 전에 `di.instances.ipc.registerBridge(bridge)`로 연결합니다. 선언되지 않은 route는 등록할 수 없습니다. 생성 매니페스트를 직접 편집하지 않으며 신규 업무 경로는 Main·shared·preload·renderer 전체를 기존 계약에 맞게 연결해야 합니다. 자동 feature add는 제공하지 않습니다.

Main 업무의 반환값은 직렬화 가능한 계약으로 제한하고 Usecase 결과의 비밀값·내부 스택을 제거합니다. renderer는 명시적 preload 메서드를 공통 Api로 호출합니다. 앱 종료는 di.dispose()에 맡기며 살아 있는 다른 창의 임의 메시지를 허용하지 않습니다.

이 문서의 호출은 구조 설명이며 실제 업무 구현과 실행 검증을 포함하지 않습니다. 앱 루트에서 npm run check 후 선택 기능의 필요한 검사만 수행합니다.
