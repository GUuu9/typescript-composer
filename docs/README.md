# v0.0.0 문서 색인

Composer 설계 문서와 새 앱에 복사하는 문서는 아래처럼 구분합니다. 현재 제공 기능과 요청 시 구현할 보호 계약을 함께 관리합니다. 사후 추가·역추출 계약은 명령 제공을 뜻하지 않습니다.

| 위치 | 용도 |
| :--- | :--- |
| [contracts](contracts/composition-contract.md) | Composer 조립·각 실행 환경·통신의 승인 계약. 앱에 복사하지 않음 |
| [validation/commonValidation.md](validation/commonValidation.md) | Composer 공통 조립·새 임시 앱 검증 절차 |
| [reviews/compositionRulesReview.md](reviews/compositionRulesReview.md) | 점검 당시 발견 사항·후속 수정·미검증 기록 |
| components/**/files/docs/*.md | 선택한 구성품의 사용 설명. 앱의 docs/로 복사 |
| components/**/files/docs/validation/*Validation.md | 선택한 구성품의 사용자 검증 절차. 앱의 docs/validation/으로 복사 |
| src/**/*.contract.ts·*.validation.ts | 생성 앱의 타입·실행 시 검증 코드. 소유 기능 옆에 유지 |

## 승인 계약

- [공통 조립](contracts/composition-contract.md)
- [웹·React·backend-webui](contracts/web-contract.md)
- [Electron](contracts/electron-contract.md)
- [React·Phaser 웹·Electron](contracts/phaser-contract.md)
- [HTTP](contracts/http-contract.md)
- [TCP](contracts/tcp-contract.md)
- [UDP·MQTT·Socket.IO](contracts/communication-expansion-contract.md)
- [선택 Logger Service](contracts/logger-contract.md)

## 기능별 검증 원본

- [Phaser](../components/01-base/phaser/files/docs/validation/phaserValidation.md)
- [TCP](../components/03-features/tcp/files/docs/validation/tcpValidation.md)
- [UDP](../components/03-features/udp/files/docs/validation/udpValidation.md)
- [MQTT](../components/03-features/mqtt/files/docs/validation/mqttValidation.md)
- [Socket.IO](../components/03-features/socket-io/files/docs/validation/socketIoValidation.md)
- [Logger](../components/03-features/logger/files/docs/validation/loggerValidation.md)

검사 문서는 필요 시 사용하는 참고 절차이며 현재 완료를 위한 의무 실행 목록이 아닙니다. 사용 중 문제가 보고되면 관련 검사만 새 임시 앱에서 수행합니다. 기존 project/ 앱은 검사·이행 대상이 아니며 이번 문서 이동으로 변경하지 않습니다. 실제 수행한 결과는 루트 update.md를 따릅니다.

Electron 초기화 중 종료 수정의 참고 절차는 [electronShutdownValidation.md](validation/electronShutdownValidation.md)를 따릅니다.

통신 오류 전달·TCP 업무 상한·backend 산출물 정리는 [runtimeRegressionValidation.md](validation/runtimeRegressionValidation.md)에 확인 절차를 기록합니다.

## Feature 사용법 원본

- [http](../components/03-features/http/files/docs/http.md)
- [http-client](../components/03-features/http-client/files/docs/httpClient.md)
- [tcp](../components/03-features/tcp/files/docs/tcp.md)
- [udp](../components/03-features/udp/files/docs/udp.md)
- [mqtt](../components/03-features/mqtt/files/docs/mqtt.md)
- [socket-io](../components/03-features/socket-io/files/docs/socketIo.md)
- [ipc](../components/03-features/ipc/files/docs/ipc.md)
- [ipc-client](../components/03-features/ipc-client/files/docs/ipcClient.md)
- [logger](../components/03-features/logger/files/docs/logger.md)
