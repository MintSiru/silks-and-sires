/* global console, process, URL, document, window */
// 먼저 npm run build -- --configLoader runner 를 실행한다.
// npm run dev 없이 빌드 산출물을 Playwright 요청 가로채기로 제공한다.
// 실행: node tests/ui/ux2-shell.smoke.mjs
import { chromium, expect } from '/opt/node-tools/node_modules/playwright/test.mjs';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.resolve(process.cwd(), 'dist');
(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    headless: true,
    args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text());
    });
    await page.route('http://ux2.local/**', async (route) => {
      const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
      const file = path.join(root, pathname === '/' ? 'index.html' : pathname);
      if (!file.startsWith(root) || !fs.existsSync(file)) {
        await route.fulfill({ status: 404, body: '' });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: file.endsWith('.js')
          ? 'text/javascript'
          : file.endsWith('.css')
            ? 'text/css'
            : 'text/html',
        body: fs.readFileSync(file),
      });
    });
    await page.goto('http://ux2.local/');
    await expect(page.getByRole('navigation', { name: '화면 선택' })).toHaveCount(0);
    await page.getByRole('textbox', { name: '마주 이름', exact: true }).fill('구름들 마주');
    await page.getByRole('button', { name: '새 게임 시작', exact: true }).click();
    const nav = page.getByRole('navigation', { name: '화면 선택' });
    await expect(nav).toBeVisible({ timeout: 60000 });
    await expect(nav.getByRole('button')).toHaveCount(7);
    const startDate = await page.getByTestId('game-date').innerText();
    await page.screenshot({ path: '/tmp/ux2-home.png', fullPage: true });
    await nav.getByRole('button', { name: '마구간', exact: true }).click();
    await expect(page.getByRole('navigation', { name: '마구간 구분' }).getByRole('button')).toHaveCount(4);
    const horse = page.locator('.stable-table tbody .horse-link').first();
    const horseName = await horse.innerText();
    await horse.click();
    let dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '출주 계획', exact: true }).click();
    const approve = dialog.getByRole('button', { name: '승인', exact: true });
    const proposedBefore = await approve.count();
    assert(proposedBefore > 0, '새 게임 현역마에 자동 제안이 있어야 한다');
    await approve.first().click();
    await expect(dialog.locator('.plan-table')).toContainText('승인됨');
    await page.screenshot({ path: '/tmp/ux2-horse-plans.png', fullPage: true });
    await dialog.getByRole('button', { name: '말 상세 닫기' }).click();
    await page.getByRole('button', { name: '4주 진행', exact: true }).click();
    await expect(page.getByTestId('game-date')).not.toHaveText(startDate);
    const endDate = await page.getByTestId('game-date').innerText();
    assert.equal(endDate, '2026년 1월 5주');
    await page.getByRole('button', { name: '메뉴', exact: true }).click();
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '저장했습니다.' })).toBeVisible();
    await page.getByRole('button', { name: '1주 진행', exact: true }).click();
    await page.getByRole('button', { name: '불러오기', exact: true }).click();
    await expect(page.getByTestId('game-date')).toHaveText(endDate);
    await nav.getByRole('button', { name: '번식', exact: true }).click();
    await expect(page.locator('[data-slot="breeding-proposals"]')).toHaveCount(1);
    assert(
      !(await page.locator('.shell-main').innerText()).includes(horseName),
      '번식 화면에는 현역마가 없어야 한다',
    );
    await nav.getByRole('button', { name: '마구간', exact: true }).click();
    await page.getByRole('button', { name: /^번식 암말 \(/ }).click();
    await page.locator('.stable-table tbody .horse-link').first().click();
    dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: '임신/교배', exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: '출주 계획', exact: true })).toHaveCount(0);
    await dialog.getByRole('button', { name: '말 상세 닫기' }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await nav.getByRole('button', { name: '홈', exact: true }).click();
    await page.screenshot({ path: '/tmp/ux2-mobile.png', fullPage: true });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
      '좁은 화면에서 문서 가로 넘침 없음',
    );
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify(
        {
          result: 'PASS',
          startDate,
          endDate,
          horseName,
          proposedBefore,
          errors,
          screenshots: ['/tmp/ux2-home.png', '/tmp/ux2-horse-plans.png', '/tmp/ux2-mobile.png'],
        },
        null,
        2,
      ),
    );
    await page.close();
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
