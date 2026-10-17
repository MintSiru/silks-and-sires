/* global process, URL */
// UI 검토용 스크린숏(1440×900, 새 게임 → 24주 진행 뒤). 먼저 npm run build. 실행: npm run screens
// 결과: docs/feedback/screens/*.png — 아스트라·아르곤 재검토(docs/feedback/ui-review-request.md) 첨부용
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs'; // 로컬(맥)에서는 npx playwright 설치 뒤 'playwright' 로 바꿔 실행
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(process.cwd(), 'dist');
const out = path.resolve(process.cwd(), 'docs/feedback/screens');
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route('http://cap.local/**', async (route) => {
  const p = decodeURIComponent(new URL(route.request().url()).pathname);
  const file = path.join(root, p === '/' ? 'index.html' : p);
  if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: '' });
  const type = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html';
  return route.fulfill({ status: 200, contentType: type, body: fs.readFileSync(file) });
});
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
await page.goto('http://cap.local/');
await page.waitForTimeout(1500);
await shot('01-시작-화면');
await page.getByRole('textbox', { name: '마주 이름', exact: true }).fill('구름들 마주');
await page.getByRole('button', { name: '이 조건으로 시작', exact: true }).click();
const nav = page.getByRole('navigation', { name: '화면 선택' });
await nav.waitFor({ timeout: 90000 });
for (let k = 0; k < 6; k++) { await page.getByRole('button', { name: '4주 진행', exact: true }).click(); await page.waitForTimeout(500); }
const menus = ['홈', '마구간', '번식', '경주', '세일', '목장', '경영', '기록'];
for (let i = 0; i < menus.length; i++) { await nav.getByRole('button', { name: menus[i], exact: true }).click(); await page.waitForTimeout(400); await shot(`${String(i + 2).padStart(2, '0')}-${menus[i]}`); }
await nav.getByRole('button', { name: '마구간', exact: true }).click();
await page.locator('.stable-table tbody .horse-link').first().click();
const dialog = page.getByRole('dialog');
const tabs = ['개요', '출주 계획', '전적', '혈통', '기록'];
for (let i = 0; i < tabs.length; i++) { const b = dialog.getByRole('button', { name: tabs[i], exact: true }); if (await b.count()) { await b.click(); await page.waitForTimeout(300); await shot(`${10 + i}-말상세-${tabs[i]}`); } }
await dialog.getByRole('button', { name: '말 상세 닫기' }).click();
await page.getByRole('button', { name: '메뉴', exact: true }).click();
await page.waitForTimeout(300);
await shot('15-메뉴-설정');
await browser.close();
