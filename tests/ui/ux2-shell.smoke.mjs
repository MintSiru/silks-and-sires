/* global console, process, URL, document, window, requestAnimationFrame, indexedDB, Blob, Response, DecompressionStream, CompressionStream */
// 먼저 npm run build -- --configLoader runner 를 실행한다.
// npm run dev 없이 빌드 산출물을 Playwright 요청 가로채기로 제공한다.
// 실행: node tests/ui/ux2-shell.smoke.mjs
import { chromium, expect } from '/opt/node-tools/node_modules/playwright/test.mjs';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.resolve(process.cwd(), 'dist');
const reportPath = '/tmp/ux3-shell-smoke.json';
const measurements = {};
const screenshots = [];
const layoutFailures = [];
const errors = [];
const menuNames = ['홈', '마구간', '번식', '경주', '세일', '목장', '경영', '기록'];
const legacyTabs = ['연대기', '왕조 목표', '부계·모계', '명예의 전당', '라이벌'];
function writeReport(extra = {}) {
  const report = {
    result: layoutFailures.length || errors.length ? 'FAIL' : 'PASS',
    measurements,
    layoutFailures,
    errors,
    screenshots,
    ...extra,
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  return report;
}
(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    headless: true,
    args: ['--no-sandbox'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.route('http://ux2.local/**', async (route) => {
      const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
      if (pathname === '/favicon.ico') {
        await route.fulfill({ status: 204, body: '' });
        return;
      }
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
    async function measure(name, phase, mobile = false) {
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
      const size = await page.evaluate(() => ({
        scrollHeight: document.documentElement.scrollHeight,
        innerHeight: window.innerHeight,
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      measurements[`${phase}:${name}`] = size;
      if (size.scrollWidth > size.innerWidth)
        layoutFailures.push(`${phase}:${name} 가로 넘침: ${size.scrollWidth} > ${size.innerWidth}`);
      if (!mobile && size.scrollHeight > size.innerHeight + 4)
        layoutFailures.push(
          `${phase}:${name} 세로 스크롤: ${size.scrollHeight} > ${size.innerHeight} + 4`,
        );
    }
    await measure('시작', 'desktop');
    await page.getByRole('textbox', { name: '마주 이름', exact: true }).fill('구름들 마주');
    await page.getByRole('button', { name: '이 조건으로 시작', exact: true }).click();
    const nav = page.getByRole('navigation', { name: '화면 선택' });
    await expect(nav).toBeVisible({ timeout: 60000 });
    await expect(nav.getByRole('button')).toHaveCount(8);
    const startDate = await page.getByTestId('game-date').innerText();
    async function measureMenus(phase, mobile = false) {
      for (const name of menuNames) {
        await nav.getByRole('button', { name, exact: true }).click();
        await measure(name, phase, mobile);
        if (!mobile) {
          const shot = `/tmp/ux3-${phase}-${menuNames.indexOf(name)}.png`;
          await page.screenshot({ path: shot, fullPage: true });
          screenshots.push(shot);
        }
      }
      await measureLegacyTabs(phase, mobile);
    }
    async function measureLegacyTabs(phase, mobile = false) {
      await nav.getByRole('button', { name: '기록', exact: true }).click();
      const tabs = page.getByRole('navigation', { name: '기록 구분' });
      await expect(tabs.getByRole('button')).toHaveCount(5);
      for (const name of legacyTabs) {
        await tabs.getByRole('button', { name, exact: true }).click();
        await measure(`기록/${name}`, phase, mobile);
        if (name === '왕조 목표') await expect(page.locator('.legacy-goals > .panel')).toHaveCount(12);
      }
    }
    await measureMenus('desktop');
    await nav.getByRole('button', { name: '홈', exact: true }).click();
    await page.screenshot({ path: '/tmp/ux2-home.png', fullPage: true });
    await nav.getByRole('button', { name: '마구간', exact: true }).click();
    await expect(
      page.getByRole('navigation', { name: '마구간 구분' }).getByRole('button'),
    ).toHaveCount(4);
    const horse = page.locator('.stable-table tbody .horse-link').first();
    const horseName = await horse.innerText();
    await horse.click();
    let dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '출주 계획', exact: true }).click();
    // 기본(자동) 모드: 제안은 '자동 출주 예정'이고 조작은 [제외]뿐이다(승인 버튼 없음)
    const planTable = dialog.locator('.plan-table');
    const proposedBefore = await planTable.getByRole('button', { name: '제외', exact: true }).count();
    assert(proposedBefore > 0, '새 게임 현역마에 자동 제안이 있어야 한다');
    await expect(planTable).toContainText('자동 출주 예정');
    await expect(planTable.getByRole('button', { name: '승인', exact: true })).toHaveCount(0);
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
    // M6-U2: 저장 뒤 모달은 닫힌다. 불러오기는 메뉴를 다시 열어 진행한다.
    await page.getByRole('button', { name: '메뉴', exact: true }).click();
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
    await nav.getByRole('button', { name: '홈', exact: true }).click();
    await page.getByRole('button', { name: '4주 진행', exact: true }).click();
    await page.getByRole('button', { name: '4주 진행', exact: true }).click();
    await page.getByRole('button', { name: '4주 진행', exact: true }).click();
    await page.getByRole('button', { name: '4주 진행', exact: true }).click();
    await page.getByRole('button', { name: '4주 진행', exact: true }).click();
    await measureMenus('replay24');
    await page.setViewportSize({ width: 390, height: 844 });
    await measureMenus('mobile', true);
    await nav.getByRole('button', { name: '홈', exact: true }).click();
    await page.screenshot({ path: '/tmp/ux2-mobile.png', fullPage: true });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      true,
      '좁은 화면에서 문서 가로 넘침 없음',
    );
    // 실제 저장·불러오기 경로로 다년 기록을 넣어 빈 화면 이외의 모든 기록 탭을 확인한다.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole('button', { name: '메뉴', exact: true }).click();
    await page.getByRole('button', { name: '저장', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: '저장했습니다.' })).toBeVisible();
    const fixture = await page.evaluate(async () => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('silks-and-sires');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const record = await new Promise((resolve, reject) => {
        const request = db.transaction('data', 'readonly').objectStore('data').get('autosave');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      // 압축 레코드(gz)는 풀어서 고치고 다시 gz 로 쓴다. 옛 json 레코드는 지금처럼 json 으로 쓴다(M6-S S1).
      const readRecordText = (rec) => (rec.gz
        ? new Response(new Blob([rec.gz]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
        : Promise.resolve(rec.json));
      const writeRecordText = async (rec, text) => {
        if (rec.gz) {
          rec.gz = new Uint8Array(await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
        } else {
          rec.json = text;
        }
      };
      const envelope = JSON.parse(await readRecordText(record));
      const state = envelope.state;
      const horses = Object.values(state.horses).filter((horse) => horse.ownerId === state.playerOwnerId);
      const runner = horses.find((horse) => horse.status === 'in_training');
      const sire = state.horses[runner.sireId];
      const mare = horses.find((horse) => horse.status === 'broodmare');
      runner.damId = mare.id;
      const rivals = Object.values(state.owners).filter((owner) => !owner.isPlayer).slice(0, 3);
      const year = state.date.year;
      state.chronicle = Array.from({ length: 90 }, (_, index) => ({
        id: `${year}-${index + 1}`, kind: 'g1_win', date: { year, week: index % 52 + 1 },
        horseId: runner.id, player: true, label: '구름들 컵',
      }));
      state.chronicle.push({ id: `${year - 1}-1`, kind: 'first_win', date: { year: year - 1, week: 3 }, horseId: runner.id, player: true });
      state.chronicle.push({ id: `${year}-91`, kind: 'world_classic', date: { year, week: 20 }, horseId: runner.id, player: false, label: '푸른들 Derby' });
      state.chronicle.push({ id: `${year}-92`, kind: 'rival_clash', date: { year, week: 24 }, ownerId: rivals[0].id, horseId: runner.id, player: true, count: 3 });
      state.rivals = rivals.map((owner, index) => ({ ownerId: owner.id, since: year - 1, reason: 'big_race', active: index < 2, intensity: index < 2 ? 65 : 0, playerAhead: 2, rivalAhead: 1 }));
      state.legacy = {
        lines: [{ id: `line_${sire.id}`, founderId: sire.id, parentLineId: sire.sireLineId, establishedYear: year, sons: 3, groupWinners: 8, playerBred: true }],
        families: [{ founderMareId: mare.id, establishedYear: year, blackTypeWinners: 5, playerBred: true }],
      };
      // 새해 첫 주 1회 진행으로 실제 awards_announced 이벤트를 발생시킨다.
      state.date = { year: year + 1, week: 1 };
      state.season.year = year + 1;
      state.yearEnd.lastSubmittedYear = year + 1;
      await writeRecordText(record, JSON.stringify(envelope));
      await new Promise((resolve, reject) => {
        const tx = db.transaction('data', 'readwrite');
        tx.objectStore('data').put(record);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
      db.close();
      return { name: runner.name, year };
    });
    await page.getByRole('button', { name: '메뉴', exact: true }).click();
    await page.getByRole('button', { name: '불러오기', exact: true }).click();
    await measureMenus('legacy-fixture');
    await nav.getByRole('button', { name: '기록', exact: true }).click();
    // 앞 단계가 마지막 탭(라이벌)에 머물러 있으므로 연대기 탭으로 돌아간다.
    await page.getByRole('navigation', { name: '기록 구분' }).getByRole('button', { name: '연대기', exact: true }).click();
    const timeline = page.getByRole('region', { name: '연대기 목록' });
    await expect(timeline.locator('details').first()).toHaveAttribute('open', '');
    await expect(timeline.locator('details').last()).not.toHaveAttribute('open', '');
    // 연도 묶음은 주요 순간 5건만 먼저 보이므로, 긴 목록의 내부 스크롤은 '전체 N건 보기' 뒤에 확인한다.
    await timeline.getByRole('button', { name: /^전체 \d+건 보기$/ }).first().click();
    assert(await timeline.evaluate((element) => element.scrollHeight > element.clientHeight), '긴 연대기는 내부 스크롤');
    await page.getByLabel('기록 범위').selectOption('world');
    await expect(timeline).toContainText('푸른들 Derby');
    await expect(timeline.locator('li')).toHaveCount(1);
    await page.getByLabel('기록 범위').selectOption('mine');
    await timeline.locator('.horse-link').first().click();
    dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: fixture.name, exact: true })).toBeVisible();
    await expect(dialog.locator('.legacy-timeline')).toContainText('구름들 컵');
    await dialog.getByRole('button', { name: '혈통', exact: true }).click();
    await expect(dialog.locator('.legacy-badges')).toContainText('확립 부계');
    await expect(dialog.locator('.legacy-badges')).toContainText('명문 모계');
    await dialog.getByRole('button', { name: '말 상세 닫기' }).click();
    await nav.getByRole('button', { name: '홈', exact: true }).click();
    await expect(page.locator('.home-rival-row')).toHaveCount(2);
    await page.getByRole('button', { name: '1주 진행', exact: true }).click();
    const ceremony = page.getByRole('dialog', { name: `${fixture.year}년 연말 시상식` });
    await expect(ceremony).toBeVisible();
    await expect(ceremony).toContainText('명성 보상 합계');
    await measure('시상식', 'legacy-fixture');
    await page.setViewportSize({ width: 390, height: 844 });
    await measure('시상식', 'legacy-mobile', true);
    await ceremony.getByRole('button', { name: '시상식 닫기' }).click();
    await measureMenus('legacy-mobile', true);
    await page.setViewportSize({ width: 1440, height: 900 });
    await nav.getByRole('button', { name: '경주', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: '순위·시상', exact: true }).click();
    await page.getByRole('button', { name: '지난 시상', exact: true }).click();
    await page.getByRole('button', { name: '연말 시상식 다시 보기', exact: true }).click();
    await expect(ceremony).toBeVisible();
    await ceremony.getByRole('button', { name: '시상식 닫기' }).click();
    screenshots.push('/tmp/ux2-home.png', '/tmp/ux2-horse-plans.png', '/tmp/ux2-mobile.png');
    const report = writeReport({ startDate, endDate, horseName, proposedBefore });
    console.log(JSON.stringify(report, null, 2));
    assert.deepEqual(layoutFailures, [], '각 메뉴의 크기는 measurements와 스크린숏을 확인하세요');
    assert.deepEqual(errors, []);
    await page.close();
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  console.log(JSON.stringify(writeReport({ result: 'FAIL', failure: e.message }), null, 2));
  process.exitCode = 1;
});
