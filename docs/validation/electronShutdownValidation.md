# Electron 초기화 중 종료 확인

기존 project 앱을 사용하지 않고 별도 임시 경로에 새 electron-app을 생성해 확인합니다. 기능 검사는 에이전트가 실행하지 않았습니다.

1. 임시 앱의 DI appEntries에 두 Service를 등록합니다. 첫 initialize는 직접 완료할 수 있는 Promise로 대기하고, 두 번째 initialize와 각 dispose의 호출 횟수를 기록합니다.
2. 첫 initialize 대기 중 SIGINT 또는 앱 종료를 요청하고 첫 Promise를 완료합니다.
3. 두 번째 initialize가 호출되지 않고 각 dispose가 한 번만 호출되며 창·통신이 시작되지 않는지 확인합니다.
4. 정상 시작 후 종료와 초기화 실패 후 종료도 확인합니다. 정리 실패 시 종료 코드가 1인지 확인합니다.

기본 확인은 수명 관리자에 초기화 대역을 주입하는 단위 검사로 한정합니다. 실제 Electron 창 종료 문제가 보고된 경우에만 필요한 GUI 재현을 별도 수행하며 전체 check/build/설치/실행 순서를 기본 검사로 반복하지 않습니다. 초기화가 영원히 끝나지 않는 Service를 강제 취소하는 기능은 제공하지 않습니다.
