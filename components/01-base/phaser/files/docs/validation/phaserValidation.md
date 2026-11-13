# Phaser 파트 단위 검증

새 임시 앱에서 게임 수명 파트만 확인합니다. 기존 project 앱은 사용하지 않습니다. 기본 생성·필수 IPC·전체 앱 조합을 이 검사에 포함하지 않습니다.

```sh
# 실행 위치: 새 web-phaser 또는 electron-phaser 앱 루트 터미널
# 목적: Phaser 엔진 대신 대역을 사용한 게임 호스트의 생성·해제·중복 호출 확인
node --test test/frontend/game.test.ts
```

파일과 의존성이 준비된 상태에서 해당 검사만 실행합니다. 실제 canvas·React DOM·WebGL·Electron 창·재시작·배포 빌드는 확인하지 않습니다. 해당 부분에서 문제가 보고되면 별도 최소 재현으로 조사합니다. 검사는 에이전트가 실행하지 않았습니다.
