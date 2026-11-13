# 기본 구성과 추가 기능의 책임

상태: 사용자 승인 계약입니다.

Compose는 표준 6개 구성과 필수 연결만 생성합니다. typescript-backend·web-app·web-phaser는 기본 통신 없이 생성하고 backend-webui는 HTTP와 frontend Api, Electron 결합은 창·preload·필수 IPC를 완성합니다.

추가 HTTP·TCP·UDP·MQTT·Socket.IO·logger와 외부 frontend HTTP Api는 필요한 파일을 복사하고 패키지·환경·DI·수명을 앱에서 직접 연결합니다. feature add와 자동 충돌 병합·복구·수동 적용 확인 명령은 구현 대상에서 제외합니다. 기존 앱은 변경하지 않습니다.

다른 계약의 선택 통신·Service 자동 등록 또는 사후 추가 명령 설계보다 이 기준을 우선합니다. 프로토콜의 보안·오류·수명 제한은 유지합니다. 새로운 기능은 자체 소스·의존성 안내·환경·DI 연결·사용법·선택 검사 문서만 추가하며 생성기를 수정하지 않습니다.

구성품 선언과 생성 매니페스트는 기본 구성·필수 연결에만 사용합니다. 상태는 최초 생성·verify 결과 기록에 사용하며 수동 추가 기능을 자동 관리하거나 활성화하지 않습니다. 수동 복사 후 사용자 코드와 설정을 자동 재작성하지 않습니다.

추가 기능의 객체는 createDi 내부에서 지역 변수로 생성하고 필요한 Usecase·Service·Bridge 생성자에 직접 주입합니다. 수명이 필요한 객체만 같은 수명 관리자에 등록합니다. 추가 기능 때문에 di.instances를 확장하거나 업무 객체에 DI 전체를 전달하지 않습니다. 기존 필수 HTTP·IPC·window·Api의 내부 연결은 유지합니다.
