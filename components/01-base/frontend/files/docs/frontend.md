# Frontend 구조와 실행 계약

main.tsx는 선택된 DI 객체를 만들고 필요한 initialize를 기다린 뒤 빈 main 요소를 렌더링합니다. 초기화 실패 시 후속 화면 시작을 막고 역순 dispose합니다. HMR·pagehide에서도 해제를 요청하지만 브라우저 종료 시 비동기 저장 완료에 의존하지 않습니다.

| 위치 | 역할·접미사 |
| :--- | :--- |
| core/di | di.ts·diProvider.tsx·수명 계약/관리 |
| scenes/<feature> | *.page.tsx·*.page.css·*.viewmodel.ts·*.model.ts |
| services/<feature> | 기능 처리·외부 payload 검증. *.service.ts·*.model.ts |
| apis | api.ts 공통 get 계약·선택 http.api.ts·타입 선언 *.d.ts |
| components/<name> | 재사용 UI. *.component.tsx·*.component.css |
| utils·resource | 순수 *.util.ts·정적 자산·필요 시 assets.ts |
| shared | 실행 영역 간 직렬화 계약 *.contract.ts·필요한 *.validation.ts |
| test/frontend·shared·integration | 선택 영역 검사 *.test.ts·필요 시 *.test.tsx |

Page → ViewModel → Service → Api 순서입니다. Page는 입력·렌더링, ViewModel은 상태·중복 방지·취소, Service는 기능 처리·응답 payload 검증, Api는 전송을 담당합니다. 업무 객체는 DI 전체를 참조하지 않고 필요한 의존성을 생성자로 주입받습니다. 기본 생성은 업무 객체를 만들지 않습니다.

Api.get(path, signal)은 /로 시작하는 앱 경로를 base에 더해 GET하고 Promise<unknown>을 반환합니다. 성공 JSON이라도 업무 구조를 보장하지 않으므로 Service에서 검증하세요. 외부 URL·상위 경로·인코딩된 구분자는 path로 받지 않습니다. status·JSON 오류는 실패로 전달하고 AbortSignal은 fetch와 결과 반영을 중단합니다. 서버 업무의 자동 취소를 뜻하지 않습니다. None은 Api 객체를 등록하지 않고 임의 HTTP 호출도 하지 않습니다.

TSX는 Vite로 빌드하며 기본 단위 테스트는 Node가 처리할 수 있는 순수 TypeScript DI·Api를 검사합니다. frontend에서는 backend/Main·파일·Node 통신을 import하지 않습니다. PUBLIC_API_BASE_URL은 공개 값으로 빌드에 고정됩니다. 다른 .env 키나 VITE_ 접두사의 임의 값을 브라우저에 자동 공개하지 않습니다. .env.example는 공유용 양식이며 실행 설정으로 로드하지 않습니다.

사용자 소스·DI는 생성 후 재작성하지 않습니다. 초기 연결은 di.ts 안에서 사용자가 직접 관리합니다. 현재 자동 추가 명령은 제공하지 않습니다. 필요한 observable·ViewModel·Page는 실제 기능 구현 시 추가하고 빈 클래스를 만들지 않습니다.
