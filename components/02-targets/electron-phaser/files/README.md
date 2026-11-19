# Phaser application

업무 예제·자산·저장 없이 빈 GameScene과 800×600 canvas를 생성합니다. DI 초기화 후 게임을 시작하고 앱 종료·HMR에서 게임과 공유 자원을 정리합니다. Scene 종료는 공유 Service를 해제하지 않습니다.

실행·통신·검증 기준은 docs/phaser.md를 확인하세요.

React UI와 Phaser 게임 영역을 함께 제공합니다. main.tsx의 DiProvider 아래에서 GameComponent를 배치하며 게임 호스트의 제거·재마운트는 앱 공유 Service를 유지합니다. 실행 전 docs/validation/phaserValidation.md의 설치·타입·수명·화면 검증을 직접 진행하세요.

## 관리 파일 수정 주의

<!-- 기능 추가 시 .composer/state.json·진단·lock·산출물을 임의 편집하지 않습니다. 사용자 DI·업무 소스는 직접 수정합니다. -->

직접 수정하지 않는 관리 기록과 수정 가능한 파일의 구분은 [관리 파일 안내](docs/managedFiles.md)를 따릅니다.
