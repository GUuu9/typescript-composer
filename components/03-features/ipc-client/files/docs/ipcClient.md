# IPC Api 사용법

electron-app·electron-phaser의 필수 renderer Api입니다. Service에 공통 Api를 주입하고 `await api.get('/status', signal)`처럼 선언된 경로만 호출합니다. status는 설명용 경로이며 기본 업무 API가 아닙니다.

Main의 route 선언·Bridge, shared 직렬화 계약, 명시적 preload 메서드와 경로가 모두 연결되어야 합니다. 현재 업무 경로의 자동 추가 명령은 없으며 features.manifest나 ipcRoutes.manifest를 직접 바꿔 우회하지 않습니다. 새로운 경로는 기존 계약에 맞춘 수동 앱 연결 작업 또는 별도 구성품 작업으로 추가합니다.

AbortSignal은 renderer가 결과를 기다리고 반영하는 것을 중단합니다. Main 업무를 자동 취소하지 않습니다. 반환 unknown은 Service에서 검증하며 renderer에 ipcRenderer나 Node 접근을 공개하지 않습니다.

이 문서의 호출은 구조 설명이며 실제 업무 구현과 실행 검증을 포함하지 않습니다. 앱 루트에서 npm run check 후 선택 기능의 필요한 검사만 수행합니다.
