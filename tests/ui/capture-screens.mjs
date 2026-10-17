/* global console, process, URL, document, indexedDB, Blob, Response, DecompressionStream, CompressionStream */
// UI 검토용 스크린숏(1440×900, 새 게임 → 24주 진행 뒤). 먼저 npm run build. 실행: npm run screens
// 결과: docs/feedback/screens/*.png — 아스트라·아르곤 재검토(docs/feedback/ui-review-request.md) 첨부용
// 01~15: 기본 메뉴·말 상세·설정. 16~22: 다건 기록 저장본(연대기 접힘·전체), 판매 탭, 공사 중 목장,
//        5대 혈통, 번식 모두 승인 확인창, 설정 새 게임 확인 단계.
// 상태를 바꾸는 촬영(legacy 주입·공사 시작)은 01~15 뒤에 둔다. 실패하는 단계는 건너뛰고 콘솔에 사유를 남기며,
// 스크립트 전체는 끝까지 돈다(마지막에 찍힌 목록과 건너뛴 목록을 출력).
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
const captured = [];
const skipped = [];
const shot = async (name) => {
  await page.screenshot({ path: `${out}/${name}.png` });
  captured.push(name);
};
/** 한 단계를 실행한다. 실패하면 사유를 콘솔·요약에 남기고 열린 창을 닫은 뒤 다음 단계로 간다. */
async function step(name, fn) {
  try {
    await fn();
  } catch (e) {
    const reason = String(e?.message ?? e).split('\n')[0];
    skipped.push(`${name}: ${reason}`);
    console.warn(`[건너뜀] ${name} — ${reason}`);
    await closeOverlays();
  }
}
/** 토스트(role=status)가 사라질 때까지 기다린다. 촬영 화면의 버튼을 가리지 않게 한다(최대 6초). */
async function waitToastGone() {
  await page.locator('.toast-region').waitFor({ state: 'hidden', timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(200);
}
/** 열린 대화상자(말 상세·메뉴·확인창)를 닫는다. 남아 있으면 다음 단계의 클릭이 막힌다. */
async function closeOverlays() {
  for (let i = 0; i < 3; i++) {
    const dialogs = page.getByRole('dialog');
    if ((await dialogs.count()) === 0) return;
    const close = dialogs.first().getByRole('button', { name: /^(말 상세 닫기|닫기|시상식 닫기|취소)$/ }).first();
    if ((await close.count()) > 0) await close.click({ timeout: 3000 }).catch(() => {});
    else await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }
}
await page.goto('http://cap.local/');
await page.waitForTimeout(1500);
await shot('01-시작-화면');
await page.getByRole('textbox', { name: '마주 이름', exact: true }).fill('구름들 마주');
await page.getByRole('button', { name: '이 조건으로 시작', exact: true }).click();
const nav = page.getByRole('navigation', { name: '화면 선택' });
await nav.waitFor({ timeout: 90000 });
// M6-T3: '4주 진행'이 중요 결정 앞에서 멈추므로 24주(6월 3주)에 닿을 때까지 누른다(최대 15번).
const weekIndex = (text) => { const m = text.match(/(\d+)년 (\d+)월 (\d+)주/); return m ? (Number(m[1]) - 2026) * 60 + Number(m[2]) * 5 + Number(m[3]) : 0; };
for (let k = 0; k < 15 && weekIndex(await page.getByTestId('game-date').innerText()) < weekIndex('2026년 6월 3주'); k++) {
  const target = weekIndex('2026년 6월 3주') - weekIndex(await page.getByTestId('game-date').innerText());
  await page.getByRole('button', { name: target >= 4 ? '4주 진행' : '1주 진행', exact: true }).click();
  await page.waitForTimeout(500);
}
const menus = ['홈', '마구간', '번식', '경주', '세일', '목장', '경영', '기록'];
for (let i = 0; i < menus.length; i++) {
  await step(`${String(i + 2).padStart(2, '0')}-${menus[i]}`, async () => {
    await nav.getByRole('button', { name: menus[i], exact: true }).click();
    await page.waitForTimeout(400);
    await shot(`${String(i + 2).padStart(2, '0')}-${menus[i]}`);
  });
}
await step('마구간-말상세', async () => {
  await nav.getByRole('button', { name: '마구간', exact: true }).click();
  await page.locator('.stable-table tbody .horse-link').first().click();
  const dialog = page.getByRole('dialog');
  const tabs = ['개요', '출주 계획', '전적', '혈통', '기록'];
  for (let i = 0; i < tabs.length; i++) {
    await step(`${10 + i}-말상세-${tabs[i]}`, async () => {
      const b = dialog.getByRole('button', { name: tabs[i], exact: true });
      if (await b.count()) { await b.click(); await page.waitForTimeout(300); await shot(`${10 + i}-말상세-${tabs[i]}`); }
    });
  }
  await dialog.getByRole('button', { name: '말 상세 닫기' }).click();
});
await step('15-메뉴-설정', async () => {
  await page.getByRole('button', { name: '메뉴', exact: true }).click();
  await page.waitForTimeout(300);
  await shot('15-메뉴-설정');
});
await closeOverlays();

// 16~17: 다건 기록 저장본. ux2-shell.smoke.mjs 의 legacy-fixture 주입과 같은 방식(저장 → IndexedDB 주입 → 불러오기).
const timeline = () => page.getByRole('region', { name: '연대기 목록' });
await step('16-기록-연대기-예시', async () => {
  await page.getByRole('button', { name: '메뉴', exact: true }).click();
  // M6-S S3: 수동 칸 2 에 저장(모달은 열린 채) → 닫고 주입 → 칸 2 불러오기(스모크와 같은 흐름)
  await page.getByRole('button', { name: '칸 2 저장', exact: true }).click();
  await page.getByRole('status').filter({ hasText: '칸 2에 저장했습니다.' }).waitFor({ timeout: 10000 });
  await page.getByRole('dialog').getByRole('button', { name: '닫기', exact: true }).click();
  const fixture = await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('silks-and-sires');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const record = await new Promise((resolve, reject) => {
      const request = db.transaction('data', 'readonly').objectStore('data').get('slot-2');
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
    // 날짜를 다음 해 1월 1주로 옮긴다(주 진행은 하지 않는다). 번식 예약 창이 이 날짜부터 열린다.
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
  await page.getByRole('button', { name: '칸 2 불러오기', exact: true }).click();
  // 불러오기는 비동기다. 주입한 날짜(다음 해 1월 1주)가 보일 때까지 기다린 뒤 기록 화면으로 간다.
  const nextDate = `${fixture.year + 1}년 1월 1주`;
  await page.waitForFunction((text) => (document.querySelector('[data-testid="game-date"]')?.textContent ?? '').includes(text), nextDate, { timeout: 15000 });
  await nav.getByRole('button', { name: '기록', exact: true }).click();
  await page.getByRole('navigation', { name: '기록 구분' }).getByRole('button', { name: '연대기', exact: true }).click();
  await timeline().waitFor({ timeout: 10000 });
  await page.waitForTimeout(300);
  await shot('16-기록-연대기-예시');
});
await step('17-기록-연대기-전체', async () => {
  await timeline().getByRole('button', { name: /^전체 \d+건 보기$/ }).first().click();
  await page.waitForTimeout(300);
  await shot('17-기록-연대기-전체');
});

// 18~22: 상태가 바뀌는 촬영은 여기서부터. 순서는 명세 V8 대로 둔다.
await step('18-세일-판매', async () => {
  await nav.getByRole('button', { name: '세일', exact: true }).click();
  await page.getByRole('navigation', { name: '세일 구분' }).getByRole('button', { name: '판매', exact: true }).click();
  await page.waitForTimeout(300);
  await shot('18-세일-판매');
});
await step('19-목장-공사-중', async () => {
  await nav.getByRole('button', { name: '목장', exact: true }).click();
  // 자금이 있어 '공사 시작'이 켜진 첫 시설을 고른다(같은 시간에는 공사 하나뿐). 모두 꺼져 있으면 여기서 실패한다.
  const start = page.locator('.farm-facility-table tbody button:enabled', { hasText: '공사 시작' }).first();
  if ((await start.count()) === 0) throw new Error("'공사 시작' 버튼이 켜진 시설이 없음(자금 부족 또는 목장 없음)");
  // 불러오기 토스트가 공사 시작 버튼을 가리지 않도록 사라질 때까지 기다린 뒤 누른다.
  await waitToastGone();
  await start.click();
  await page.locator('.farm-construction').waitFor({ timeout: 10000 });
  await waitToastGone();
  await shot('19-목장-공사-중');
});
await step('20-말상세-혈통-5대', async () => {
  await nav.getByRole('button', { name: '마구간', exact: true }).click();
  await page.locator('.stable-table tbody .horse-link').first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: '혈통', exact: true }).click();
  await dialog.getByRole('button', { name: '5대 보기', exact: true }).click();
  await page.waitForTimeout(300);
  await shot('20-말상세-혈통-5대');
  await dialog.getByRole('button', { name: '말 상세 닫기' }).click();
});
await step('21-번식-모두-승인-확인', async () => {
  await nav.getByRole('button', { name: '번식', exact: true }).click();
  // 승인 대기 제안이 없으면 버튼 이름이 '모두 처리됨'으로 바뀌고 꺼진다. 그때는 찍지 않고 건너뛴다.
  const bulk = () => page.getByRole('button', { name: /^모두 (승인|처리됨)$/ });
  const approvable = async () => (await bulk().count()) > 0 && (await bulk().innerText()) === '모두 승인' && (await bulk().isEnabled());
  if (!(await approvable())) {
    // 승인 대기 제안이 없으면 '교배 담당에게 다시 짜기'로 제안을 만든다(예약은 하지 않는다. 자동 승인이 꺼진 기본 설정).
    const replan = page.getByRole('button', { name: '교배 담당에게 다시 짜기', exact: true });
    if ((await replan.count()) > 0 && (await replan.isEnabled())) {
      await replan.click();
      await waitToastGone();
    } else {
      console.warn('[건너뜀] 21 — 교배 담당에게 다시 짜기 버튼이 꺼져 있음(예약 창 닫힘 또는 파산 잠금)');
    }
  }
  if (!(await approvable())) {
    const label = (await bulk().count()) > 0 ? await bulk().innerText() : '없음';
    throw new Error(`승인 대기 제안 없음(모두 승인 버튼: '${label}', 다시 짜기 후에도 꺼짐)`);
  }
  await bulk().click();
  const confirm = page.getByRole('dialog', { name: '교배 제안을 모두 승인할까요?' });
  await confirm.waitFor({ timeout: 5000 });
  await shot('21-번식-모두-승인-확인');
  // 확인창만 찍고 취소한다(실제 예약은 하지 않는다).
  await confirm.getByRole('button', { name: '취소', exact: true }).click();
});
await step('22-메뉴-새-게임-확인', async () => {
  await page.getByRole('button', { name: '메뉴', exact: true }).click();
  const settings = page.getByRole('dialog');
  await settings.getByRole('button', { name: '새 게임', exact: true }).click();
  const group = page.getByRole('group', { name: '새 게임 확인' });
  await group.waitFor({ timeout: 5000 });
  await shot('22-메뉴-새-게임-확인');
  // 확인 단계에서 '취소'만 누른다. '새 게임으로 이동'은 누르지 않는다.
  await group.getByRole('button', { name: '취소', exact: true }).click();
});
await closeOverlays();

console.log(`[촬영] ${captured.length}장: ${captured.join(', ')}`);
if (skipped.length > 0) console.log(`[건너뜀] ${skipped.length}건:\n${skipped.map((s) => `  - ${s}`).join('\n')}`);
else console.log('[건너뜀] 없음');
await browser.close();
