import { beforeAll, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { bootstrapGame } from '../../src/engine/state/bootstrap';
import {
  getNamingData, getNicks, getPeopleData, getRaceTemplates, getRacecourses, getSalesData,
  getSeriesDefinitions, getStallionNames, getStallionRecords,
} from '../../src/engine/data/staticData';
import { announceWeekOf } from '../../src/engine/sales/system';
import { formatDateKo } from '../../src/engine/time/calendar';
import type {
  ChronicleEntry, EconomyYearSummary, GameEvent, GameState, GameDate, HorseId, JockeyId, LedgerEntry,
  OwnerId, PerformanceEntry, RaceGrade, RaceResult, RunnerResult,
} from '../../src/engine/types';
import { feeKo, saleAnnounceKo } from '../../src/ui/game/text';
import { chronicleTagOf } from '../../src/ui/legacy/legacyView';
import YearReview from '../../src/ui/yearEnd/YearReview';
import { yearReviewView, type YearReviewCard, type YearReviewView } from '../../src/ui/yearEnd/yearReviewView';

let base: GameState;
beforeAll(() => {
  const data = { nicks: getNicks(), naming: getNamingData(), ...getPeopleData(),
    templates: getRaceTemplates(), courses: getRacecourses(), sales: getSalesData(),
    series: getSeriesDefinitions(), stallionNames: getStallionNames(), stallionRecords: getStallionRecords() };
  base = bootstrapGame({ seed: 20261017, playerName: '테스트', silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' } }, data);
}, 600_000);

/** 연말 정산 대기 상태: 새해 1주. 돌아보는 해 Y = 새해 - 1. 장부·레이스·연대기 등 지난해 기록은 비운 뒤 테스트가 채운다 */
function fresh(): { state: GameState; Y: number; NY: number } {
  const state = structuredClone(base);
  const NY = base.date.year + 1;
  const Y = NY - 1;
  state.date = { year: NY, week: 1 };
  state.yearEnd.lastSubmittedYear = Y;
  state.eventLog = [];
  state.raceResults = [];
  state.seasonState.performances = {};
  state.seasonState.ratingHistory = {};
  state.economy.currentYear = { player: {}, aiTotals: {} };
  state.economy.playerLedger = [];
  state.economy.debt = 0;
  state.economy.yearSummaries = [];
  state.chronicle = [];
  for (const horse of Object.values(state.horses)) {
    if (horse.ownerId === state.playerOwnerId) horse.ownerId = null;
    if (horse.breederId === state.playerOwnerId) horse.breederId = null;
  }
  return { state, Y, NY };
}

function ids(state: GameState, count: number): HorseId[] {
  return Object.keys(state.horses).slice(0, count);
}

function own(state: GameState, horseId: HorseId): void {
  state.horses[horseId]!.ownerId = state.playerOwnerId;
}

const COURSE = getRacecourses()[0]!;

/** 순서대로 착순을 매긴 레이스 결과. order = [말, 착순] */
function raceOf(date: GameDate, raceId: string, distance: number, order: [HorseId, number][]): RaceResult {
  const runners = [...order].sort((a, b) => a[1] - b[1]).map(([horseId, position], i) => ({
    runnerIndex: i, horseId, saddleCloth: i + 1, draw: i + 1, jockeyId: Object.keys(base.jockeys)[0] as JockeyId, weightLb: 130,
    position, finishTime: 100 + i, margin: null, beatenLengths: 0, sectionals: [], performanceFigure: 0, odds: null,
  })) as RunnerResult[];
  return { raceId, racecourseId: COURSE.id, date, going: 'good', distance, seed: 1, winningTime: 100,
    sectionalMarks: [], runners };
}

/** 등급 있는 레이스는 퍼포먼스에 모든 출주마의 기록이 남는다(season/apply.ts 와 같은 규칙) */
function recordGraded(state: GameState, result: RaceResult, grade: RaceGrade): void {
  for (const runner of result.runners) {
    const entry: PerformanceEntry = { raceId: result.raceId, templateId: null, date: result.date, grade,
      distance: result.distance, country: COURSE.country, position: runner.position, pr: 100 };
    state.seasonState.performances[runner.horseId] = [...(state.seasonState.performances[runner.horseId] ?? []), entry];
  }
}

function raceRun(date: GameDate, raceId: string, playerHorseIds: HorseId[]): GameEvent {
  return { type: 'race_run', raceId, meetingId: 'm', date, winnerId: playerHorseIds[0] ?? 'none', playerHorseIds };
}

function cardOf(view: YearReviewView, key: YearReviewCard['key']): YearReviewCard {
  const card = view.cards.find((c) => c.key === key);
  if (card === undefined) throw new Error(`카드 없음: ${key}`);
  return card;
}

function valueOf(card: YearReviewCard, label: string): string {
  const row = card.rows.find((r) => r.label === label);
  if (row === undefined) throw new Error(`행 없음: ${label}`);
  return row.value;
}

describe('한 해 돌아보기: 경주 숫자', () => {
  it('지난해 픽스처에서 출주·승수·입상·블랙타입·상금·최고 레이스·최고 레이팅 말을 맞춘다', () => {
    const { state, Y } = fresh();
    const [A, B, C, D, E] = ids(state, 5) as [HorseId, HorseId, HorseId, HorseId, HorseId];
    own(state, A); own(state, B); own(state, C);

    // 지난해 1: G1 — 내 말 A 1착, B 4착 / AI D 2착, E 5착
    const g1 = raceOf({ year: Y, week: 10 }, 'race_g1', 2000, [[A, 1], [D, 2], [B, 4], [E, 5]]);
    // 지난해 2: 리스티드 — 내 말 C 3착, A 2착 / AI D 1착
    const listed = raceOf({ year: Y, week: 20 }, 'race_l', 1600, [[D, 1], [C, 3], [A, 2]]);
    // 지난해 3: 일반 레이스 — 내 말 B 1착, C 2착 / AI E 3착
    const plain = raceOf({ year: Y, week: 30 }, 'race_plain', 1400, [[B, 1], [C, 2], [E, 3]]);
    // 지난해 4: AI 만 나온 G2 — 내 말 아님
    const aiOnly = raceOf({ year: Y, week: 25 }, 'race_g2_ai', 1800, [[D, 1], [E, 2]]);
    // 지난해가 아닌 해의 내 말 1착 — 집계 제외
    const older = raceOf({ year: Y - 1, week: 10 }, 'race_old', 2000, [[A, 1]]);
    state.raceResults = [g1, listed, plain, aiOnly, older];
    recordGraded(state, g1, 'G1');
    recordGraded(state, listed, 'L');
    recordGraded(state, aiOnly, 'G2');
    state.eventLog = [
      raceRun({ year: Y, week: 10 }, 'race_g1', [A, B]),
      raceRun({ year: Y, week: 20 }, 'race_l', [C, A]),
      raceRun({ year: Y, week: 30 }, 'race_plain', [B, C]),
      raceRun({ year: Y, week: 25 }, 'race_g2_ai', []),
    ];
    state.economy.currentYear.player = { prize: 250000, series_bonus: 50000, sale_proceeds: 180000, sale_purchase: -90000, farm_upkeep: -40000 };
    state.seasonState.ratingHistory = {
      [A]: [{ date: { year: Y, week: 10 }, raceId: 'race_g1', from: null, to: 104 }],
      [B]: [{ date: { year: Y, week: 30 }, raceId: 'race_plain', from: 95, to: 110 }],
      [C]: [{ date: { year: Y - 1, week: 5 }, raceId: 'race_old', from: null, to: 130 }],
    };

    const view = yearReviewView(state);
    expect(view.year).toBe(Y);
    expect(view.titleKo).toBe(`${Y}년 돌아보기`);
    const racing = cardOf(view, 'racing');
    // 출주 6회(A·B G1, C·A 리스티드, B·C 일반), 1승(A G1 + B 일반 = 2승), 입상 5회
    expect(valueOf(racing, '출주')).toBe('6회 · 2승 · 입상 5회');
    // 그룹: G1 1승(A), 입상 1회(B 4착은 제외 → 입상은 A 1착 1회)
    expect(valueOf(racing, '그룹·리스티드')).toBe('그룹 1승 · 입상 1회 / 리스티드 0승 · 입상 2회');
    expect(valueOf(racing, '상금 합계')).toBe(feeKo(250000));
    // 최고 성적: G1 1착 (A)
    expect(valueOf(racing, '최고 성적 레이스')).toBe(
      `${formatDateKo({ year: Y, week: 10 })} · ${COURSE.name} 2000m · G1 1착 · ${state.horses[A]!.name}`,
    );
    // 최고 레이팅 말: B 110 → 숫자 없이 문구만
    const rating = valueOf(racing, '올해 최고 레이팅 말');
    expect(rating).toBe(`${state.horses[B]!.name} · 그룹 수준`);
    expect(rating).not.toContain('110');
    expect(racing.notices).toEqual([]);
    // 올해 아닌 해(C 130)는 제외: 최고 레이팅 말은 B(110)다
  });

  it('출주가 없는 해는 안내 문구와 빈 값을 보인다', () => {
    const { state } = fresh();
    const view = yearReviewView(state);
    const racing = cardOf(view, 'racing');
    expect(valueOf(racing, '출주')).toBe('0회 · 0승 · 입상 0회');
    expect(valueOf(racing, '최고 성적 레이스')).toBe('출주 기록 없음');
    expect(valueOf(racing, '올해 최고 레이팅 말')).toBe('레이팅 기록 없음');
    expect(racing.notices).toEqual(['올해는 출주한 말이 없었습니다.']);
  });
});

describe('한 해 돌아보기: 생산·거래·경영', () => {
  it('장부 연 요약으로 판매·구매·수입·지출·순손익을 맞춘다', () => {
    const { state, Y } = fresh();
    const [A, B, C, D] = ids(state, 4) as [HorseId, HorseId, HorseId, HorseId];
    own(state, A); own(state, B);
    // 출산: 내 생산(breederId = 플레이어, 지난해 태어남) 1두 + AI 생산 1두(제외)
    state.horses[D]!.birthYear = Y;
    state.horses[D]!.breederId = state.playerOwnerId;
    state.horses[C]!.birthYear = Y;
    state.horses[C]!.breederId = 'ow-ai-breeder' as OwnerId;
    const entry = (category: LedgerEntry['category'], amount: number, horseId: HorseId | null, year = Y): LedgerEntry =>
      ({ date: { year, week: 12 }, category, amount, horseId });
    state.economy.playerLedger = [
      entry('sale_proceeds', 120000, A),
      entry('stallion_sale', 60000, B),
      entry('private_sale', 20000, B),
      entry('sale_purchase', -90000, C),
      entry('private_sale', -30000, D),
      entry('farm_upkeep', -40000, null),
      entry('sale_proceeds', 999, A, Y - 1),
    ];
    state.economy.currentYear.player = { prize: 250000, sale_proceeds: 120000, stallion_sale: 60000, private_sale: -10000, sale_purchase: -90000, farm_upkeep: -40000 };
    const view = yearReviewView(state);
    const trade = cardOf(view, 'trade');
    expect(valueOf(trade, '출산')).toBe('1두');
    expect(valueOf(trade, '판매')).toBe(`3두 · ${feeKo(200000)}`);
    expect(valueOf(trade, '구매')).toBe(`2두 · ${feeKo(120000)}`);
    expect(trade.notices).toEqual([]);

    const finance = cardOf(view, 'finance');
    // 수입 = 250000 + 120000 + 60000; 지출 = 10000 + 90000 + 40000
    expect(valueOf(finance, '수입')).toBe(feeKo(430000));
    expect(valueOf(finance, '지출')).toBe(feeKo(140000));
    expect(valueOf(finance, '순손익')).toBe(`흑자 ${feeKo(290000)}`);
    expect(finance.rows.find((row) => row.label === '빚')).toBeUndefined();
  });

  it('지난해 적자이면 적자로 표기한다', () => {
    const { state } = fresh();
    state.economy.currentYear.player = { prize: 10000, farm_upkeep: -40000 };
    const finance = cardOf(yearReviewView(state), 'finance');
    expect(valueOf(finance, '순손익')).toBe(`적자 ${feeKo(30000)}`);
  });

  it('연초 자금이 기록돼 있으면 연초→연말 자금을 보이고, 없으면 연말 자금만 보인다', () => {
    const { state, Y } = fresh();
    state.owners[state.playerOwnerId]!.funds = 150000;
    const summary: EconomyYearSummary = { year: Y - 1, player: {}, aiTotals: {}, aiFundsMedian: 0, aiFundsTotal: 0,
      playerFunds: 100000, playerDebt: 0 };
    expect(valueOf(cardOf(yearReviewView(state), 'finance'), '자금')).toBe('연말 €150,000');
    state.economy.yearSummaries = [summary];
    expect(valueOf(cardOf(yearReviewView(state), 'finance'), '자금')).toBe(`연초 ${feeKo(100000)} → 연말 ${feeKo(150000)}`);
  });

  it('빚이 있는 해는 빚 행과 안내 문구를 보인다', () => {
    const { state } = fresh();
    state.economy.debt = 12000;
    const finance = cardOf(yearReviewView(state), 'finance');
    expect(valueOf(finance, '빚')).toBe(feeKo(12000));
    expect(finance.notices).toEqual([`빚 ${feeKo(12000)}이 남아 있습니다.`]);
  });
});

describe('한 해 돌아보기: 주요 순간과 내년 준비', () => {
  it('연대기 내 기록 중 우선순위가 높은 5개만, 기록 순서대로 보인다', () => {
    const { state, Y } = fresh();
    const [A, B] = ids(state, 2) as [HorseId, HorseId];
    own(state, A); own(state, B);
    const at = (week: number): { date: GameDate } => ({ date: { year: Y, week } });
    const chronicle: ChronicleEntry[] = [
      { id: `${Y}-1`, kind: 'first_runner', horseId: A, player: true, ...at(2) },
      { id: `${Y}-2`, kind: 'first_win', horseId: A, player: true, ...at(6) },
      { id: `${Y}-3`, kind: 'group_win', horseId: A, player: true, label: '가상 스테이크스', count: 1, ...at(10) },
      { id: `${Y}-4`, kind: 'g1_win', horseId: A, player: true, label: '가상 스테이크스', ...at(10) },
      { id: `${Y}-5`, kind: 'classic_win', horseId: B, player: true, label: '가상 클래식', ...at(20) },
      { id: `${Y}-6`, kind: 'rival_clash', horseId: A, player: true, count: 3, ...at(24) },
      { id: `${Y}-7`, kind: 'leading_title', player: true, label: 'europe:3', ...at(40) },
      { id: `${Y}-8`, kind: 'world_classic', player: false, label: '가상 클래식', ...at(20) },
    ];
    state.chronicle = chronicle;
    const moments = cardOf(yearReviewView(state), 'moments');
    expect(moments.rows).toHaveLength(5);
    const labels = moments.rows.map((row) => row.label);
    expect(labels).not.toContain(chronicleTagOf('first_runner').label);
    expect(labels).not.toContain(chronicleTagOf('first_win').label);
    expect(labels).toEqual([
      chronicleTagOf('group_win').label, chronicleTagOf('g1_win').label, chronicleTagOf('classic_win').label,
      chronicleTagOf('rival_clash').label, chronicleTagOf('leading_title').label,
    ]);
    expect(moments.notices).toEqual([]);
  });

  it('기록이 없으면 안내 문구를 보인다', () => {
    const { state } = fresh();
    expect(cardOf(yearReviewView(state), 'moments').notices).toEqual(['올해 기록된 순간이 없습니다.']);
  });

  it('교배 예약 두수·2세 두수·첫 세일 발표 일정을 내년 기준으로 맞춘다', () => {
    const { state, NY } = fresh();
    const [A, B, C, D] = ids(state, 4) as [HorseId, HorseId, HorseId, HorseId];
    own(state, A); own(state, B); own(state, C);
    // 2세: 새해 나이 2 = birthYear NY-2 (C 만)
    state.horses[A]!.birthYear = NY - 3;
    state.horses[B]!.birthYear = NY - 4;
    state.horses[C]!.birthYear = NY - 2;
    // 교배 예약: 내 암말 D 1두(새해 시즌), AI 암말 E 는 제외
    const E = ids(state, 5)[4]!;
    state.horses[D]!.ownerId = state.playerOwnerId;
    state.horses[D]!.birthYear = NY - 5;
    state.mares[D] = { ...(state.mares[D] ?? state.mares[Object.keys(state.mares)[0]!]!), horseId: D,
      bookedFor: { stallionId: A, season: NY } };
    state.mares[E] = { ...(state.mares[E] ?? state.mares[Object.keys(state.mares)[0]!]!), horseId: E,
      bookedFor: { stallionId: A, season: NY } };
    const next = cardOf(yearReviewView(state), 'next');
    expect(valueOf(next, '교배 예약')).toBe(`1두 (${NY}년 시즌)`);
    expect(valueOf(next, '2세가 되는 말')).toBe('1두');
    const first = [...getSalesData().events].sort((a, b) => announceWeekOf(a) - announceWeekOf(b) || (a.id < b.id ? -1 : 1))[0]!;
    expect(valueOf(next, '첫 세일')).toBe(`${first.name} · ${saleAnnounceKo(NY, NY, announceWeekOf(first))}`);
  });
});

describe('한 해 돌아보기: 화면', () => {
  it('다섯 카드를 접을 수 있는 기본 펼침 블록으로 그린다', () => {
    const { state } = fresh();
    const view = yearReviewView(state);
    expect(view.cards.map((card) => card.key)).toEqual(['racing', 'trade', 'finance', 'moments', 'next']);
    const html = renderToStaticMarkup(createElement(YearReview, { view }));
    expect(html).toContain('<details class="year-review" open="">');
    expect(html).toContain(`<summary>${view.titleKo}</summary>`);
    for (const card of view.cards) expect(html).toContain(`<h3>${card.titleKo}</h3>`);
    expect(html).not.toContain('OR');
  });

  it('같은 상태는 같은 뷰를 만든다', () => {
    const { state } = fresh();
    expect(yearReviewView(state)).toEqual(yearReviewView(structuredClone(state)));
  });
});
