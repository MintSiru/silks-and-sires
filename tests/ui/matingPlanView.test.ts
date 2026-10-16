import 'fake-indexeddb/auto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, expect, it } from 'vitest';
import { getNicks, getStallionRecords } from '../../src/engine/data/staticData';
import type { GameState } from '../../src/engine/types';
import BreedingScreen from '../../src/ui/breeding/BreedingScreen';
import MatingPlanPanel from '../../src/ui/breeding/MatingPlanPanel';
import { matingPlanErrorKo, matingPlanRows } from '../../src/ui/breeding/matingPlanView';
import { useGame, type GameApi } from '../../src/ui/game/useGame';

const data = { nicks: getNicks(), stallionRecords: getStallionRecords() };
let game: GameApi;
let state: GameState;
beforeAll(() => {
  function Capture() { game = useGame(); return null; }
  renderToStaticMarkup(createElement(Capture));
  game.newGame({ seed: 20261011, playerName: '가상 마주', economyMode: 'casual', startType: 'owner_breeder',
    difficulty: 'normal', homeCountry: 'GB', catastrophicInjuries: false, grantRacehorses: true,
    silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' } });
  const result = game.proposeMatings();
  if (!result.ok) throw new Error(result.error);
  state = result.state;
}, 120_000);

it('공개 니크·근친·거리·상태·수준을 순수하게 표로 만든다', () => {
  const before = JSON.stringify(state);
  const rows = matingPlanRows(state, data);
  expect(rows.length).toBeGreaterThan(0);
  expect(rows[0]).toMatchObject({ statusLabel: '검토 대기', canApprove: true, canChange: true });
  expect(rows[0]!.quality).toContain('최고 OR');
  expect(rows[0]!.fee).toContain('€');
  expect(rows[0]!.inbreeding).toContain('%');
  expect(rows[0]!.distance).toContain('m');
  const hidden = { ...state, breeding: { ...state.breeding, revealedNicks: [] } };
  expect(matingPlanRows(hidden, data)[0]!.nick).toBe('미확인');
  expect(JSON.stringify(state)).toBe(before);
  const closed = { ...state, date: { ...state.date, week: 30 } };
  expect(matingPlanRows(closed, data).every((r) => !r.canApprove)).toBe(true);
  expect(matingPlanErrorKo('not_booking_window')).toContain('예약 창');
  expect(matingPlanErrorKo('invalid_fee_cap')).toContain('정수');
});

it('번식 화면 맨 위 슬롯에서 일괄 승인·자동 승인·상한·대안·빼기를 제공한다', () => {
  const html = renderToStaticMarkup(createElement(BreedingScreen, { game: { ...game, state } }));
  expect(html.indexOf('data-slot="breeding-proposals"')).toBeLessThan(html.indexOf('수동 배합'));
  for (const text of ['교배 제안', '모두 승인', '자동 승인', '한 두당 종부료 상한', '니크', '근친', '거리 보완', '대안으로 바꾸기', '승인</button>', '빼기</button>']) expect(html).toContain(text);
  const locked = renderToStaticMarkup(createElement(MatingPlanPanel, { state, game, locked: true }));
  expect(locked).toContain('disabled=""');
  expect(locked).toContain('현재 진행이 잠겨');
});

it('useGame은 복제 목록·변경·빼기·다시 짜기를 제공하며 제외 기록을 보존한다', () => {
  const proposals = game.matingProposals();
  const first = proposals[0]!;
  proposals.splice(0, 1);
  expect(game.matingProposals()).toHaveLength(proposals.length + 1);
  const changed = game.changeMating(first.mareId, first.alternatives[0]!);
  expect(changed.ok).toBe(true);
  const removed = game.removeMating(first.mareId);
  expect(removed.ok).toBe(true);
  const replanned = game.proposeMatings();
  if (!replanned.ok) throw new Error(replanned.error);
  state = replanned.state;
  expect(game.matingProposals().find((p) => p.mareId === first.mareId)?.status).toBe('skipped');
  expect(game.matingProposals().some((p) => p.status === 'proposed')).toBe(true);
});

it('승인 이벤트는 로그에 한 번 기록하고 완료 행은 바꿀 수 없다', () => {
  const result = game.approveAllMatings();
  if (!result.ok) throw new Error(result.error);
  state = result.state;
  expect(result.events.some((e) => e.type === 'covering_booked')).toBe(true);
  for (const event of result.events) expect(state.eventLog.filter((e) => JSON.stringify(e) === JSON.stringify(event))).toHaveLength(1);
  const rows = matingPlanRows(state, data);
  expect(rows.every((r) => !r.canApprove && !r.canChange)).toBe(true);
  expect(rows.some((r) => r.statusLabel === '예약 완료')).toBe(true);
  const html = renderToStaticMarkup(createElement(MatingPlanPanel, { state, game, locked: false }));
  expect(html).not.toContain('대안으로 바꾸기');
});

it('자동 승인·0원 상한·제안·예약 상태를 저장하고 불러온다', async () => {
  game.setAutoApproveMatings(true);
  const capped = game.setMatingFeeCap(0);
  expect(capped.ok).toBe(true);
  const proposals = game.matingProposals();
  await game.save();
  game.setAutoApproveMatings(false);
  game.setMatingFeeCap(null);
  expect(await game.load()).toBe(true);
  expect(game.matingProposals()).toEqual(proposals);
  const after = game.setMatingFeeCap(0);
  if (!after.ok) throw new Error(after.error);
  expect(after.state.settings.autoApproveMatings).toBe(true);
  expect(after.state.settings.matingFeeCap).toBe(0);
});
