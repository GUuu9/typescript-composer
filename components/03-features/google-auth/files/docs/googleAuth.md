# Google 소셜 로그인 수동 연결

Node backend의 HTTP 구성에 적용합니다. `files/src`와 이 문서를 대상 앱의 같은 상대 경로로 복사합니다. Express HTTP가 없는 backend는 먼저 [HTTP 수동 연결](../../http/files/docs/http.md)을 참고해 구성합니다. 복사한 앱의 HTTP 문서 경로는 `docs/http.md`입니다.

## Google 콘솔과 환경 설정

Google Cloud에서 웹 애플리케이션 OAuth 클라이언트를 만들고, 브라우저가 접근하는 origin의 `/api/auth/google/callback` 전체 주소를 승인된 리디렉션 URI에 등록합니다. 로그인 화면, API 프록시와 callback을 같은 origin에서 제공합니다. 프록시에서 공개 origin과 backend가 다르면 동일한 공개 origin을 HTTP의 `HTTP_ALLOWED_ORIGINS`에도 추가합니다. 운영에서는 HTTPS를 사용하고, 로컬 HTTP는 개발 중 루프백 주소에만 허용됩니다. [Google OpenID Connect 설정](https://developers.google.com/identity/openid-connect/openid-connect#settingupoauth2.0)

```dotenv
# 파일: .env.example
# 적용: 서버 환경 양식에 추가합니다. 실제 값은 서버 .env에 작성합니다.
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=
GOOGLE_IDENTITY_KEY=
```

네 항목을 모두 비우면 Google 로그인을 비활성화합니다. 활성화 시 `GOOGLE_IDENTITY_KEY`는 독립적인 고정 비밀키로, 서버 터미널에서 `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"`로 생성할 수 있습니다. 기존 계정과 연결하려면 같은 키를 유지해야 합니다. 서버 로그와 프록시 로그에도 callback 쿼리, 쿠키, 토큰과 비밀키를 기록하지 않도록 설정합니다.

## DI와 앱 계정 연결

앱의 계정 객체가 `GoogleAuthAccounts`를 구현합니다. `signIn(identity)`는 연결된 계정의 세션을 발급하고 미가입이면 `null`을 반환합니다. `signUp(identity, input)`은 앱 규칙에 따라 입력을 검증하고 계정 연결 및 세션 발급을 완료합니다. 식별자 중복은 저장소의 고유 제약으로 방지합니다. 두 메서드는 앱 사용자 ID, 세션 토큰, 밀리초 단위 만료 시각을 반환합니다. 세션 조회와 로그아웃에서 같은 쿠키 이름을 사용합니다.

```ts
// 파일: src/backend/core/di.ts
// 적용: 기존 import 아래와 createDi의 HTTP 생성 직후에 각각 추가하는 부분 예시입니다.
import { GoogleAuthBridge } from '../bridge/googleAuth/googleAuth.http.bridge.ts';
import { readGoogleAuthConfig } from '../config/googleAuth.config.ts';
import { createGoogleAuthService } from '../services/googleAuth/googleAuth.service.ts';
import { GoogleAuthUsecase } from '../usecases/googleAuth/googleAuth.usecase.ts';

// createDi 내부. googleAccounts는 앱이 준비한 GoogleAuthAccounts 구현입니다.
const googleConfig = readGoogleAuthConfig();
const google = googleConfig ? createGoogleAuthService(googleConfig) : null;
const googleAuth = new GoogleAuthUsecase(google, googleAccounts);
const callbackOrigin = googleConfig ? new URL(googleConfig.redirectUri).origin : null;
const secure = callbackOrigin?.startsWith('https:') ?? false;
const sessionCookieName = secure ? '__Host-app-session' : 'app-session';
features.instances.http.registerBridge(new GoogleAuthBridge(
  googleAuth, callbackOrigin ? [callbackOrigin] : [], secure, sessionCookieName,
));
features.lifecycleEntries.push({
  name: 'googleAuth', dependencies: [], dispose: () => googleAuth.dispose(),
});
```

인증 시도는 서버 메모리에 최대 10분간 유효합니다. 다중 인스턴스에서 사용하려면 시작, callback 및 가입 완료 요청이 같은 프로세스로 전달돼야 합니다. Google 요청 범위는 `openid`이며 계정 처리에는 검증된 `sub`의 HMAC 식별자만 넘깁니다.

## 브라우저 연결

| 요청 | 브라우저 동작 |
| --- | --- |
| `GET /api/auth/google/status` | `payload.enabled`로 버튼을 표시하고 `payload.needsNickname`이 참이면 가입 폼을 엽니다. 필드명은 기존 앱과 호환됩니다. |
| `POST /api/auth/google/start` | 빈 JSON 객체를 보내고 응답의 `payload.url`로 브라우저를 이동시킵니다. |
| `GET /api/auth/google/callback` | Google이 호출합니다. 인증 후 앱 루트로 돌아오면 세션과 가입 상태를 다시 조회합니다. |
| `POST /api/auth/google/complete` | 앱에서 정의한 가입 JSON을 보내고 성공 후 세션 상태를 조회합니다. |

## package.json과 README 버전 기록

HTTP 구성의 `express`와 `@types/express`를 재사용합니다. Google 전용 패키지는 필요하지 않습니다.

```md
<!-- 파일: README.md -->
<!-- 적용: 앱의 수동 구성품 기록에 추가합니다. -->
| Google 소셜 로그인 | Composer 원본 v0.0.0 | 기존 HTTP의 Express 및 Node 내장 API | src/backend/core/di.ts · docs/googleAuth.md |
```

앱 루트에서 `npm run check`를 실행해 계정 객체와 DI 연결을 확인합니다. 선택 검사는 테스트 파일을 복사한 뒤 앱 루트에서 `node --test test/backend/googleAuth.test.ts`로 실행합니다. 실제 통합 확인은 승인된 Google 테스트 계정으로 신규 가입, 재로그인, 로그아웃을 각각 진행합니다.
