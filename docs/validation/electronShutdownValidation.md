# Electron 초기화 중 종료 확인

기존 project 앱을 사용하지 않고 별도 임시 경로에 새 electron-app을 생성해 확인합니다. 기능 검사는 에이전트가 실행하지 않았습니다.

1. 임시 앱의 DI appEntries에 두 Service를 등록합니다. 첫 initialize는 직접 완료할 수 있는 Promise로 대기하고, 두 번째 initialize와 각 dispose의 호출 횟수를 기록합니다.
2. 첫 initialize 대기 중 SIGINT 또는 앱 종료를 요청하고 첫 Promise를 완료합니다.
3. 두 번째 initialize가 호출되지 않고 각 dispose가 한 번만 호출되며 창·통신이 시작되지 않는지 확인합니다.
4. 정상 시작 후 종료와 초기화 실패 후 종료도 확인합니다. 정리 실패 시 종료 코드가 1인지 확인합니다.

임시 앱 루트의 별도 터미널에서 `npm run check`, `npm run build`, `npm run setup:electron`, `npm start` 순서로 실행합니다. 초기화가 영원히 끝나지 않는 Service를 강제 취소하는 기능은 제공하지 않습니다.
