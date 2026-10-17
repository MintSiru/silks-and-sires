import 'fake-indexeddb/auto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';
import { getNicks, getStallionRecords } from '../../src/engine/data/staticData';
import type { GameState } from '../../src/engine/types';
import BreedingScreen from '../../src/ui/breeding/BreedingScreen';
import MatingPlanPanel, { MatingApproveDialog } from '../../src/ui/breeding/MatingPlanPanel';
import {
  approvalSummary,
  bulkApproveState,
  INBREED_CAUTION_PERCENT,
  INBREED_RISK_PERCENT,
  matingJudgement,
  matingPlanErrorKo,
  matingPlanRows,
  matingQualityGrade,
  matingStatusTone,
  type MatingPlanRow,
} from '../../src/ui/breeding/matingPlanView';
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

/** 판단·요약 테스트용 최소 행. 화면 판정에 쓰는 필드만 채운다. */
function fakeRow(overrides: Partial<MatingPlanRow>): MatingPlanRow {
  return {
    mareId: 'm', mareName: '가상 암말', quality: '', qualityGrade: 'B', season: 2027,
    stallionId: 's', stallionName: '가상 종마', fee: '€1,000', feeAmount: 1000, nick: '—', nickLabel: null,
    inbreeding: '—', inbreedPercent: 0, distance: '—', complement: 'unknown', note: '',
    status: 'proposed', statusLabel: '검토 대기', canApprove: true, canChange: true, alternatives: [],
    judgement: { summary: '특이 사항 없음', tone: 'muted' }, ...overrides,
  } as MatingPlanRow;
}

it('공개 니크·근친·거리·상태·수준을 순수하게 표로 만든다', () => {
  const before = JSON.stringify(state);
  const rows = matingPlanRows(state, data);
  expect(rows.length).toBeGreaterThan(0);
  expect(rows[0]).toMatchObject({ statusLabel: '검토 대기', canApprove: true, canChange: true });
  expect(rows[0]!.quality).toContain('최고 OR');
  expect(['S', 'A', 'B', 'C', 'D']).toContain(rows[0]!.qualityGrade);
  expect(rows[0]!.fee).toContain('€');
  expect(typeof rows[0]!.feeAmount).toBe('number');
  expect(rows[0]!.inbreeding).toContain('%');
  expect(rows[0]!.distance).toContain('m');
  expect(rows[0]!.judgement.summary.length).toBeGreaterThan(0);
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

it('표는 열 5개(암말·제안 종마·종부료·종합 판단·상태·조작)만 보이고 근거는 펼치기 안에 든다', () => {
  const html = renderToStaticMarkup(createElement(MatingPlanPanel, { state, game, locked: false }));
  for (const head of ['암말', '제안 종마', '종부료', '종합 판단', '상태·조작']) expect(html).toContain(`>${head}</th>`);
  expect(html).not.toContain('>니크</th>');
  expect(html).not.toContain('>거리 보완</th>');
  expect(html).toContain('<details class="mating-plan__why">');
  expect(html).toContain('<summary>근거</summary>');
  expect(html).toContain('mating-plan__scroll');
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

it('승인 이벤트는 로그에 한 번 기록하고 완료 행은 바꿀 수 없으며 모두 처리됨으로 바뀐다', () => {
  const pending = matingPlanRows(state, data).filter((r) => r.canApprove);
  expect(pending.length).toBeGreaterThan(0);
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
  expect(html).toContain('모두 처리됨');
  expect(html).toContain('승인 대기 제안이 없습니다');
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

describe('수준 등급 변환 (matingQualityGrade)', () => {
  it('점수 구간을 S/A/B/C/D 로 바꾸고 최하는 D 로 묶는다', () => {
    expect(matingQualityGrade(100)).toBe('S');
    expect(matingQualityGrade(85)).toBe('S');
    expect(matingQualityGrade(84)).toBe('A');
    expect(matingQualityGrade(65)).toBe('B');
    expect(matingQualityGrade(55)).toBe('C');
    expect(matingQualityGrade(45)).toBe('D');
    expect(matingQualityGrade(10)).toBe('D');
    expect(matingQualityGrade(0)).toBe('D');
  });
});

describe('종합 판단 (matingJudgement)', () => {
  it('궁합 좋음과 니크 좋음은 장점으로, 근친 혈량은 기준선 기준으로 주의·위험을 가른다', () => {
    expect(INBREED_CAUTION_PERCENT).toBe(12.5);
    expect(INBREED_RISK_PERCENT).toBe(18.75);
    expect(matingJudgement({ complement: 'likely', nick: 'good', inbreedPercent: 6 }))
      .toEqual({ summary: '궁합 좋음 · 니크 좋음', tone: 'good' });
    expect(matingJudgement({ complement: 'likely', nick: 'unknown', inbreedPercent: 12.5 }))
      .toEqual({ summary: '궁합 좋음', tone: 'good' });
    expect(matingJudgement({ complement: 'likely', nick: 'unknown', inbreedPercent: 13 }))
      .toEqual({ summary: '궁합 좋음 · 근친 주의', tone: 'warn' });
    expect(matingJudgement({ complement: 'unlikely', nick: null, inbreedPercent: 18.75 }))
      .toEqual({ summary: '근친 주의', tone: 'warn' });
    expect(matingJudgement({ complement: 'unlikely', nick: null, inbreedPercent: 19 }))
      .toEqual({ summary: '근친 위험', tone: 'danger' });
  });

  it('니크 나쁨은 주의 톤이고, 판단 정보가 없으면 판단 정보 없음으로 보인다', () => {
    expect(matingJudgement({ complement: 'unknown', nick: 'poor', inbreedPercent: 0 }))
      .toEqual({ summary: '니크 나쁨', tone: 'warn' });
    expect(matingJudgement({ complement: 'unknown', nick: 'neutral', inbreedPercent: 0 }))
      .toEqual({ summary: '특이 사항 없음', tone: 'muted' });
    expect(matingJudgement({ complement: null, nick: null, inbreedPercent: null }))
      .toEqual({ summary: '판단 정보 없음', tone: 'muted' });
  });

  it('제안 상태 톤: 검토 대기 주의, 승인·예약 좋음, 안 함 중립', () => {
    expect(matingStatusTone('proposed')).toBe('warn');
    expect(matingStatusTone('approved')).toBe('good');
    expect(matingStatusTone('booked')).toBe('good');
    expect(matingStatusTone('skipped')).toBe('muted');
  });
});

describe('모두 승인 확인과 버튼 상태', () => {
  it('확인 요약은 승인 가능한 행만 세고 종부료를 합치며 주의·위험을 따로 센다', () => {
    const rows = [
      fakeRow({ feeAmount: 10_000, judgement: { summary: '궁합 좋음', tone: 'good' } }),
      fakeRow({ feeAmount: 4_000, judgement: { summary: '근친 주의', tone: 'warn' } }),
      fakeRow({ feeAmount: 7_000, judgement: { summary: '근친 위험', tone: 'danger' } }),
      fakeRow({ feeAmount: 99_000, canApprove: false, status: 'booked' }),
    ];
    expect(approvalSummary(rows)).toEqual({ count: 3, totalFee: 21_000, cautionCount: 1, riskCount: 1 });
    expect(approvalSummary([])).toEqual({ count: 0, totalFee: 0, cautionCount: 0, riskCount: 0 });
  });

  it('모두 승인 버튼은 잠금·예약 창 닫힘·제안 없음·전부 처리됨 순서로 사유를 보인다', () => {
    const pending = [fakeRow({})];
    const done = [fakeRow({ canApprove: false, status: 'booked', statusLabel: '예약 완료' })];
    expect(bulkApproveState(pending, { locked: true, windowOpen: true }))
      .toMatchObject({ enabled: false, label: '모두 승인', reason: '현재 진행이 잠겨 있습니다.' });
    expect(bulkApproveState(pending, { locked: false, windowOpen: false }).enabled).toBe(false);
    expect(bulkApproveState([], { locked: false, windowOpen: true }))
      .toMatchObject({ enabled: false, label: '모두 승인' });
    expect(bulkApproveState(done, { locked: false, windowOpen: true }))
      .toMatchObject({ enabled: false, label: '모두 처리됨' });
    expect(bulkApproveState(done, { locked: false, windowOpen: true }).reason).toContain('승인 대기 제안이 없습니다');
    expect(bulkApproveState(pending, { locked: false, windowOpen: true }))
      .toEqual({ enabled: true, label: '모두 승인', reason: null });
  });

  it('확인 창은 대상 두수·총 종부료·주의/위험 건수를 보이고 위험이 있으면 경고한다', () => {
    const summary = { count: 2, totalFee: 21_000, cautionCount: 1, riskCount: 1 };
    const html = renderToStaticMarkup(createElement(MatingApproveDialog, { summary, onConfirm: () => {}, onCancel: () => {} }));
    expect(html).toContain('role="dialog"');
    expect(html).toContain('€21,000');
    expect(html).toContain('2두 승인');
    expect(html).toContain('1건');
    expect(html).toContain('위험 배합이 포함');
    const safe = renderToStaticMarkup(createElement(MatingApproveDialog, {
      summary: { count: 1, totalFee: 1000, cautionCount: 0, riskCount: 0 }, onConfirm: () => {}, onCancel: () => {},
    }));
    expect(safe).not.toContain('위험 배합이 포함');
  });
});
