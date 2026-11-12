# React·Phaser 프로젝트

기본 GameScene에는 게임 규칙·업무 요청·샘플 자산·저장이 없습니다. 800×600 canvas는 컨테이너에 맞춰 표시합니다. Scene 목록과 필요한 생성자 주입은 frontend/core/scene.registry.ts, 화면 설정은 game.config.ts에서 관리합니다. Scene·Service에는 DI 전체를 전달하지 않습니다.

React UI는 Page·ViewModel·Service·Api로 구성하고 Phaser Scene은 게임 영역을 담당합니다. GameComponent는 React 소유 호스트 안에서 Phaser canvas만 관리합니다. react-common은 Provider·TSX·Vite plugin을 공유하며 DI는 앱에서 한 번 생성합니다.

앱 DI의 필수 초기화가 끝난 뒤 Game을 생성합니다. Scene을 중단하거나 바꿔도 앱 공유 Service는 해제하지 않습니다. 해당 Scene에서 추가한 이벤트·구독은 shutdown/destroy 시 정리합니다. 최소 Scene에는 해제할 업무 자원이 없으므로 빈 수명 메서드를 넣지 않았습니다.

앱 종료·pagehide·HMR에서는 초기화 중 종료도 조정하고 중복 정리를 합칩니다. Game은 pause → 준비 전이면 ready 대기 → 입력 차단·loop 중단 → destroy(true, false) → public headlessStep으로 pending destroy 처리 순서입니다. GameComponent 해제는 공유 Service를 해제하지 않습니다. 앱 종료는 React unmount → 모든 Game 해제 대기 → 공유 Service 역순 해제 순서입니다. 마지막 처리는 frame을 기다리지 않아 숨겨진 페이지에서도 진행합니다. HMR은 이전 정리 완료 후 새 Game을 만들고 canvas를 다시 확보합니다. BFCache로 복원된 페이지는 새 앱으로 로드합니다. Phaser 준비 이벤트가 발생하지 않는 엔진 부트 실패에는 별도 강제 만료를 제공하지 않습니다.

web-phaser: npm run dev는 Vite 개발, npm start는 dist/frontend 로컬 preview입니다. preview는 운영 서버가 아닙니다. HTTP를 선택한 경우만 HttpApi를 등록하며 PUBLIC_API_BASE_URL을 .env에 작성합니다. 브라우저에는 이 공개 값만 전달하고 Scene은 임의 요청하지 않습니다.

electron-phaser: npm run setup:electron으로 실행 파일을 내려받은 뒤 npm start 또는 npm run dev를 사용합니다. Main/preload/frontend는 로컬 빌드 결과를 사용하고 dev는 성공한 빌드만 기존 앱 종료 후 교체합니다. IPC는 필수이며 등록한 이름 있는 preload 메서드만 사용합니다. Main의 HTTP는 별도 선택입니다. 창·발신자·sandbox·CSP 규칙을 완화하지 않습니다. 자세한 내용은 docs/electron.md를 따릅니다.

npm run check·npm test·npm run build는 선택한 영역 전체를 대상으로 하며 :frontend 명령은 frontend만 대상으로 합니다. 일반 Node 테스트에서 Phaser DOM/WebGL·Electron Main을 실행하지 않고 수명 순서를 작은 대역으로 검사합니다. 실제 canvas·WebGL·GUI와 구분합니다.

Phaser 4.2.1의 배포 타입 선언에는 TypeScript 7에서 오류가 발생하는 선언이 있어 Phaser의 tsconfig.frontend.json에만 skipLibCheck=true를 설정합니다. 앱 소스·테스트의 strict 검사는 유지하지만 .d.ts 내부 검사는 생략됩니다. React 단독 구성에는 적용하지 않지만 Phaser 결합 구성의 React 소스도 같은 프로젝트 안에서 검사합니다. 버전을 올릴 때 해당 선언 오류가 수정되면 이 옵션을 제거해 다시 검사합니다.

실제 화면 검증은 별도 터미널에서 dev를 실행해 다음을 확인합니다: 빈 canvas 표시와 창 크기 변경 → Scene 수정 후 canvas 하나만 유지 → Service 초기화 실패 시 게임 미시작 → Electron에서는 성공 빌드 후 재시작과 빌드 실패 시 기존 창 유지 → Ctrl+C·창 닫기 후 종료. 에이전트의 타입·빌드 검사만으로 화면 실행 성공을 기록하지 않습니다.

정확한 사용자 검증 경로·명령·기대 결과는 docs/validation/phaserValidation.md를 따릅니다.
