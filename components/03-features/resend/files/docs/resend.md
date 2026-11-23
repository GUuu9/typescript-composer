# Resend 이메일 발송

`files/src`의 서비스 파일을 Node backend의 같은 상대 경로에 복사합니다. Node 내장 `fetch`를 사용하며 추가 npm 의존성은 없습니다. 서비스는 텍스트와 선택적인 HTML 이메일을 발송합니다. 메일 발송 API의 성공은 Resend가 요청을 수락했다는 뜻입니다.

Resend에서 발송 도메인을 인증하고 해당 도메인의 발송 전용 API 키를 발급합니다. 실제 키는 서버 환경에만 둡니다. [Resend 이메일 발송 API](https://resend.com/docs/api-reference/emails/send-email)

```dotenv
# 파일: .env.example
# 적용: 서버 환경 설정 양식에 추가합니다.
RESEND_API_KEY=
RESEND_FROM=
```

```ts
// 파일: src/backend/core/di.ts
// 적용: import는 파일 상단, 객체 생성은 환경 로드 후 createDi 내부에 추가합니다.
import { createResendService } from '../services/resend/resend.service.ts';

const resend = createResendService(process.env.RESEND_FROM ?? '', process.env.RESEND_API_KEY ?? '');
// 메일 발송이 필요한 앱 Usecase 생성자에 resend를 전달합니다.
```

업무에서 `await resend.send(recipient, subject, text, html)`를 호출합니다. `html`은 선택 항목이며 외부 입력을 템플릿에 직접 삽입할 때는 이스케이프가 필요합니다. 사용 권한, 발송 빈도, 수신자 검증과 재시도는 앱에서 관리합니다. 이 서비스에는 초기화 및 해제 작업이 없습니다.

## package.json과 README 버전 기록

추가 패키지 없이 적용합니다.

```md
<!-- 파일: README.md -->
<!-- 적용: 앱의 수동 구성품 기록에 추가합니다. -->
| Resend 이메일 발송 | Composer 원본 v0.0.0 · Node 내장 fetch | src/backend/core/di.ts | docs/resend.md |
```

대상 앱 루트에서 `npm run check`로 연결을 확인합니다. 실제 발송은 별도 테스트 환경의 승인된 발신 주소와 테스트 수신자로 확인합니다.
