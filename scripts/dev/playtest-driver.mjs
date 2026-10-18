/* global console, process */
// 플레이 테스트 드라이버: 열어 둔 브라우저(원격 디버깅 포트)에 붙어 한 단계씩 조작하고 스크린숏을 찍는다.
// 브라우저 상태(게임 진행)는 호출 사이에 유지된다.
// 준비(한 번):
//   1) npm run build && npx vite preview --port 4173
//   2) 크로미움을 원격 디버깅으로 띄운다. 예: chromium --headless=new --remote-debugging-port=9222 about:blank
//      (PC 에서는 크롬/엣지 실행 파일 경로를 쓰거나 `npx playwright install chromium` 뒤 그 경로)
// 사용: node scripts/dev/playtest-driver.mjs '<page 를 쓰는 JS 본문>' [스크린숏 이름]
//   예: node scripts/dev/playtest-driver.mjs "await page.goto('http://localhost:4173/'); return await page.title()" s01
// 환경 변수: PT_CDP(기본 http://localhost:9222), PT_OUT(스크린숏 폴더, 기본 ./playtest-shots)
import { chromium } from 'playwright';
import fs from 'node:fs';
const CDP = process.env.PT_CDP ?? 'http://localhost:9222';
const OUT = process.env.PT_OUT ?? 'playtest-shots';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.connectOverCDP(CDP);
const ctx = browser.contexts()[0];
const page = ctx.pages().find((p) => p.url().includes('4173')) ?? ctx.pages()[0] ?? await ctx.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
try {
  const r = await new AsyncFunction('page', process.argv[2] ?? '')(page);
  if (r !== undefined) console.log('RESULT:', typeof r === 'string' ? r : JSON.stringify(r, null, 1));
} catch (e) { console.log('ERROR:', String(e.message).split('\n').slice(0, 4).join(' | ')); }
await page.waitForTimeout(300);
if (process.argv[3]) await page.screenshot({ path: `${OUT}/${process.argv[3]}.png` });
if (errors.length) console.log('CONSOLE:', errors.slice(0, 10).join('\n'));
await browser.close();
