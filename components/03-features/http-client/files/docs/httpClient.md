# HTTP Api 사용법

web-app·web-phaser에서 http를 선택하면 포함됩니다. backend-webui는 필수 frontend HTTP Api로 포함합니다. 앱의 Api 의존성을 Service에 주입하고 `await api.get('/status', signal)`로 호출합니다. PUBLIC_API_BASE_URL이 /api라면 실제 요청은 /api/status입니다. backend에 해당 업무 API를 먼저 구현해야 하며 기본 생성에는 status API가 없습니다.

외부 주소는 PUBLIC_API_BASE_URL에 지정하고 frontend를 다시 빌드합니다. 외부 backend는 정확한 frontend Origin을 허용해야 합니다. 상대 /api는 같은 origin 또는 개발 프록시를 전제로 합니다. 반환값은 unknown이므로 Service에서 payload를 검증합니다. 비정상 상태·JSON 형식 오류·취소는 예외로 처리합니다. AbortController의 signal을 전달하고 화면 종료 시 abort()하여 늦은 결과 반영을 막습니다.

이 문서의 호출은 구조 설명이며 실제 업무 구현과 실행 검증을 포함하지 않습니다. 앱 루트에서 npm run check 후 선택 기능의 필요한 검사만 수행합니다.
