# 오류 전달·업무 제한·빌드 정리 확인

기존 project 앱 대신 별도 임시 경로의 새 앱을 사용합니다. 아래 기능 검사는 에이전트가 실행하지 않았습니다.

- HTTP+다른 통신: 서버 error 대역을 발생시켜 failure가 거부되고 다른 통신·Service가 해제되는지 확인합니다. 정상 stop은 failure를 발생시키면 안 됩니다.
- TCP: Bridge를 보류하고 클라이언트 종료 후 Bridge를 실패시킵니다. onError는 한 번 호출되고 응답은 전송하지 않아야 합니다.
- TCP: 완료되지 않는 업무 64개를 만든 뒤 추가 요청이 busy인지 확인합니다. 하나를 완료하면 새 요청이 허용되어야 합니다. 단절된 클라이언트의 업무도 포함합니다.
- 앱 루트에서 npm run build 후 backend 소스 하나를 삭제하고 다시 npm run build합니다. 대응 dist/backend 파일은 없어지고 dist/frontend·dist/preload는 backend 정리로 삭제되지 않아야 합니다. 확인용 파일은 새 임시 앱에만 만듭니다.

새 임시 앱 루트에서 npm run check와 npm test로 타입·기본 회귀를 확인합니다. 외부 서버나 운영 데이터는 사용하지 않습니다.
