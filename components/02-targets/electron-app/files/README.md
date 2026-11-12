# Electron application

`npm run verify`는 설치·check/test/build를 실행합니다. Electron 실행 파일은 별도 `npm run setup:electron`으로 내려받습니다. 이후 `npm start`로 빌드 결과를 실행하거나 `npm run dev`로 변경 감시·성공 빌드 후 재시작합니다.

개발 화면도 로컬 산출물입니다. 빌드 실패 시 기존 앱을 보존합니다. IPC가 선택되어도 기본 업무 경로는 없으며 renderer의 Node 접근·임의 채널 호출은 허용하지 않습니다. 실제 .env는 저장하지 않습니다.

GUI·재시작·Ctrl+C 검증은 실제 Electron 환경에서 별도로 수행해야 합니다.
