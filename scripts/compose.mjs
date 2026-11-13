import path from 'node:path';
import { createPlan } from './plan.mjs';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { configurations } from './configurations.mjs';
import { generateProject, validateName, composerRoot } from './generate.mjs';

export async function collectSelection(ask, report = console.log) {
  report(`표준 구성 (현재 표준 ${configurations.length}개 구성 지원):`);
  configurations.forEach((entry, index) => report(`${index + 1}. ${entry.id}${entry.implemented ? '' : ' (미구현)'}`));
  const answer = (await ask('프로젝트 구성 번호: ')).trim();
  const entry = configurations[Number(answer) - 1];
  if (!entry || !/^[1-9]\d*$/.test(answer)) throw new Error('목록의 구성 번호를 입력하세요.');
  if (!entry.implemented) throw new Error(`${entry.id}는 아직 구현되지 않았습니다. 파일은 생성하지 않았습니다.`);
  const delivery = entry.delivery;
  const selection = { configuration: entry.id };
  report(`필수 연결: ${entry.required.join(', ') || '없음'}`);
  const plan = await createPlan(path.join(composerRoot, 'components'), selection);
  const name = validateName((await ask('프로젝트 이름: ')).trim());
  report(`구성: ${entry.id}${delivery ? ` / ${delivery}` : ''}, 통신: ${entry.required.join(', ') || '없음'}\n생성 위치: project/${name}\n독립 Git 초기화 후 install/check/test/build를 수행합니다.`);
  report(`설치 패키지: ${[...plan.packages].map(([name, value]) => `${name}@${value.version}`).join(', ')}`);
  report(`설정: ${[...plan.environment].map(([key, value]) => `${key} (${value.required ? '필수' : '선택'})`).join(', ') || '필수 설정 없음'}. .env.example를 확인하세요.`);
  const confirmation = (await ask('생성할까요? (y/N): ')).trim().toLowerCase();
  return ['y', 'yes'].includes(confirmation) ? { name, selection } : null;
}

export async function main() {
  if (process.argv.length > 2 || !stdin.isTTY || !stdout.isTTY) throw new Error('npm run compose를 인자 없이 터미널에서 실행하세요.');
  const controller = new AbortController();
  const readline = createInterface({ input: stdin, output: stdout });
  const cancel = () => controller.abort();
  readline.on('SIGINT', cancel);
  process.on('SIGINT', cancel);
  process.on('SIGTERM', cancel);
  try {
    const input = await collectSelection(question => readline.question(question, { signal: controller.signal }));
    readline.close();
    if (!input) { console.log('취소했습니다. 파일을 생성하지 않았습니다.'); return; }
    const result = await generateProject({ ...input, signal: controller.signal });
    console.log(`생성·검증 완료: ${result.app}\n다음 작업: Electron은 먼저 npm run setup:electron. 앱 폴더에서 npm run dev 또는 npm start. 선택 구성의 시작·종료와 배포 방식은 앱 README를 확인하세요.`);
  } finally {
    readline.close();
    process.off('SIGINT', cancel);
    process.off('SIGTERM', cancel);
  }
}
if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
