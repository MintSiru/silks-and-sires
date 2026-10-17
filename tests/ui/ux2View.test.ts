import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createNewGame } from '../../src/engine/state/newGame';
import { generateHorse } from '../../src/engine/horse/generate';
import { createRng } from '../../src/engine/rng';
import type { GameState, Horse, HorseStatus, PlannedRace } from '../../src/engine/types';
import { getRaceTemplates, getRacecourses, getSalesData } from '../../src/engine/data/staticData';
import { upcomingRaces } from '../../src/engine/season/lookahead';
import { stableGroup, stableRows } from '../../src/ui/stable/stableView';
import { homeTasks, homeView } from '../../src/ui/home/homeView';
import {
  horseTabs,
  horseEvents,
  horseRunRows,
  horsePedigree,
  planChoices,
} from '../../src/ui/horse/horseDetailView';
import StableScreen from '../../src/ui/stable/StableScreen';
import BreedingScreen from '../../src/ui/breeding/BreedingScreen';
import App, { nextPlayerRaceInWeeks } from '../../src/ui/App';
import type { GameApi } from '../../src/ui/game/useGame';

function fixture() {
  const state = createNewGame({
    seed: 20261016,
    playerName: '구름 마주',
    silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' },
  });
  return state;
}
function addHorse(state: GameState, status: HorseStatus, id: string = status): Horse {
  const horse = generateHorse(createRng(id), {
    id,
    name: `구름 ${id}`,
    birthYear: state.date.year - 3,
    currentYear: state.date.year,
    sex: 'female',
    countryOfBirth: 'GB',
    status,
    level: 60,
  });
  horse.ownerId = state.playerOwnerId;
  state.horses[id] = horse;
  state.owners[state.playerOwnerId]!.horseIds.push(id);
  return horse;
}
function plan(horse: Horse, state: GameState, status: PlannedRace['status'] = 'proposed'): PlannedRace {
  return {
    id: `${horse.id}:${state.date.year}-8`,
    date: { year: state.date.year, week: 8 },
    templateId: null,
    target: { kinds: ['maiden'], minDistance: 1200, maxDistance: 1800 },
    status,
    note: '조교사 제안',
  };
}

describe('UX2 마구간·셸', () => {
  it('모든 생애 상태를 네 탭에 분류하고 타인 소유·은퇴·사망·혈통 전용은 제외한다', () => {
    const state = fixture();
    for (const status of [
      'in_training',
      'resting',
      'foal',
      'weanling',
      'yearling',
      'broodmare',
      'stud',
      'dead',
      'retired',
      'historical',
    ] as const)
      addHorse(state, status);
    addHorse(state, 'in_training', 'other').ownerId = 'other-owner';
    expect(stableRows(state, 'active').map((h) => h.id)).toEqual(['in_training', 'resting']);
    expect(stableRows(state, 'young').map((h) => h.id)).toEqual(['foal', 'weanling', 'yearling']);
    expect(stableRows(state, 'mares').map((h) => h.id)).toEqual(['broodmare']);
    expect(stableRows(state, 'studs').map((h) => h.id)).toEqual(['stud']);
    expect(stableGroup('dead')).toBe(null);
    expect(stableRows(state, 'active', '  RESTING  ').map((h) => h.id)).toEqual(['resting']);
  });
  it('검색·다음 제안·경고를 보여 주며 번식 화면에는 현역마를 넣지 않는다', () => {
    const state = fixture();
    const active = addHorse(state, 'in_training');
    addHorse(state, 'broodmare');
    state.seasonState.racePlans = { [active.id]: [plan(active, state)] };
    state.settings.autoApproveRacePlans = false;
    expect(stableRows(state, 'active')[0]!.warnings).toContain('제안 검토');
    expect(stableRows(state, 'active')[0]!.next).toContain('검토 대기');
    expect(renderToStaticMarkup(createElement(StableScreen, { state }))).toContain('말 이름 검색');
    const html = renderToStaticMarkup(createElement(BreedingScreen, { game: { state } as GameApi }));
    expect(html).toContain('구름 broodmare');
    expect(html).not.toContain('구름 in_training');
    expect(html).toContain('data-slot="breeding-proposals"');
    expect(html).not.toContain('1주 진행');
    expect(html).not.toContain('새 게임 시작');
  });
  it('게임이 없으면 시작 화면만 그린다', () => {
    const html = renderToStaticMarkup(createElement(App));
    expect(html).toContain('이 조건으로 시작');
    expect(html).not.toContain('공통 상단 바');
    expect(html).not.toContain('화면 선택');
  });
  it('다음 내 출주는 승인·접수 기준이며 연도를 넘긴 날짜도 처리한다', () => {
    const state = fixture();
    const h = addHorse(state, 'in_training');
    state.date.week = 51;
    const p = { ...plan(h, state), date: { year: state.date.year + 1, week: 2 } };
    state.seasonState.racePlans = { [h.id]: [p] };
    expect(nextPlayerRaceInWeeks(state)).toBe(3);
    state.settings.autoApproveRacePlans = false;
    expect(nextPlayerRaceInWeeks(state)).toBe(null);
    p.status = 'approved';
    expect(nextPlayerRaceInWeeks(state)).toBe(3);
  });
});

describe('UX2 홈', () => {
  it('출주 제안·이름·정산·마감 임박 입찰·부상 처치를 모으고 각 진입 대상을 유지한다', () => {
    const state = fixture();
    const h = addHorse(state, 'in_training');
    h.nameRegistered = false;
    h.condition.injury = { kind: 'tendon', since: state.date, weeksOut: 8, diagnosed: false };
    state.seasonState.racePlans = {
      [h.id]: [plan(h, state), { ...plan(h, state, 'approved'), id: 'approved' }],
    };
    state.yearEnd.lastSubmittedYear = state.date.year - 1;
    const sale = getSalesData().events.find((e) => e.books.some((b) => b.weekOffset > 0))!;
    const book = sale.books.find((b) => b.weekOffset > 0)!;
    state.date.week = 1;
    state.settings.autoApproveRacePlans = false;
    const tasks = homeTasks(state);
    expect(tasks.find((t) => t.id === `plan:${h.id}`)).toMatchObject({
      screen: 'horse',
      horseId: h.id,
      horseTab: 'plan',
    });
    expect(tasks.find((t) => t.id === `plan:${h.id}`)!.label).toContain('1건');
    expect(tasks.map((t) => t.id)).toEqual(
      expect.arrayContaining(['yearEnd', `name:${h.id}`, `injury:${h.id}`]),
    );
    state.date.week = sale.week + book.weekOffset - 1;
    state.sales.catalogues = [
      {
        saleId: sale.id,
        year: state.date.year,
        status: 'catalogued',
        lots: [
          {
            lotNo: 1,
            book: book.book,
            horseId: h.id,
            horseName: h.name,
            sireId: null,
            vendor: { kind: 'owner', id: state.playerOwnerId },
            reserve: null,
            valuation: 1,
            aiBids: [],
            result: null,
          },
        ],
      },
    ];
    state.sales.playerBids = [{ saleId: sale.id, year: state.date.year, lotNo: 1, maxBid: 1000 }];
    expect(homeTasks(state).some((t) => t.id.startsWith('bid:'))).toBe(true);
    state.sales.catalogues[0]!.status = 'closed';
    expect(homeTasks(state).some((t) => t.id.startsWith('bid:'))).toBe(false);
  });
  it('최근 이벤트는 부상 등 주요 사건만 최신 5건이며 주 시작·이름 짓기 같은 일반 사건은 뺀다', () => {
    const state = fixture();
    state.eventLog = Array.from({ length: 7 }, (_, i) => ({
      type: 'horse_injured' as const,
      date: state.date,
      horseId: addHorse(state, 'in_training', `h${i}`).id,
      kind: 'tendon' as const,
      weeksOut: 4,
    }));
    state.eventLog.push({ type: 'horse_named', date: state.date, horseId: 'h0', name: '0', auto: false });
    state.eventLog.push({ type: 'week_started', date: state.date });
    const events = homeView(state).events;
    expect(events).toHaveLength(5);
    expect(events[0]!.event).toMatchObject({ horseId: 'h6' });
    expect(events.every((e) => e.event.type === 'horse_injured')).toBe(true);
  });
});

describe('UX2 말 상세 순수 뷰', () => {
  it('용도별 탭 구성을 분리한다', () => {
    const state = fixture();
    expect(horseTabs(addHorse(state, 'in_training'))).toEqual([
      'overview',
      'plan',
      'record',
      'pedigree',
      'events',
    ]);
    expect(horseTabs(addHorse(state, 'broodmare'))).toEqual([
      'overview',
      'breeding',
      'foals',
      'pedigree',
      'events',
    ]);
    expect(horseTabs(addHorse(state, 'stud'))).toEqual([
      'overview',
      'book',
      'offspring',
      'pedigree',
      'events',
    ]);
    expect(horseTabs(addHorse(state, 'foal'))).toEqual(['overview', 'pedigree', 'events']);
  });
  it('기록은 말·암말·종마·산자 ID와 내 출주 배열을 모두 조회한다', () => {
    const state = fixture();
    const h = addHorse(state, 'in_training');
    state.eventLog = [
      { type: 'horse_named', horseId: h.id, name: h.name, auto: false, date: state.date },
      { type: 'covering_booked', mareId: 'other', stallionId: h.id, fee: 0, date: state.date },
      { type: 'foal_born', foalId: h.id, mareId: 'other', stallionId: 'other', date: state.date },
      {
        type: 'race_run',
        raceId: 'race',
        meetingId: 'meet',
        winnerId: 'other',
        playerHorseIds: [h.id],
        date: state.date,
      },
      { type: 'horse_named', horseId: 'unrelated', name: '다른 말', auto: false, date: state.date },
    ];
    expect(horseEvents(state, h.id)).toHaveLength(4);
    const pedigree = horsePedigree(state, h);
    expect(pedigree.root.horseId).toBe(h.id);
    expect(pedigree.summary).toContain('외조부');
  });
  it('12주 선택지는 확정 레이스와 일반 경주 조건을 제공하며 연말을 넘고 원본을 바꾸지 않는다', () => {
    const state = fixture();
    state.date.week = 49;
    const weeks = upcomingRaces(
      state,
      { courses: getRacecourses(), templates: getRaceTemplates() },
      state.date,
      12,
    );
    const before = structuredClone(weeks);
    const choices = planChoices('test-horse', weeks);
    const spring = upcomingRaces(
      state,
      { courses: getRacecourses(), templates: getRaceTemplates() },
      { year: state.date.year, week: 14 },
      12,
    );
    expect(planChoices('test-horse', spring).some((c) => c.plan.templateId !== null)).toBe(true);
    expect(choices.some((c) => c.plan.target !== null)).toBe(true);
    expect(choices.some((c) => c.plan.date.year === state.date.year + 1)).toBe(true);
    expect(choices.every((c) => c.plan.status === 'proposed')).toBe(true);
    expect(weeks).toEqual(before);
  });
  it('전적은 해당 출주의 레이스·착순·기수·중량·OR·상금을 연결한다', () => {
    const state = fixture();
    const h = addHorse(state, 'in_training');
    const race = getRaceTemplates()[0]!;
    state.seasonState.ratingHistory[h.id] = [
      { raceId: race.id, date: { year: state.date.year - 1, week: 1 }, from: 10, to: 20 },
      { raceId: race.id, date: { ...state.date }, from: 70, to: 75 },
    ];
    state.raceResults.push({
      raceId: race.id,
      racecourseId: race.racecourseId,
      date: { ...state.date },
      going: 'good',
      distance: race.distance,
      seed: 1,
      winningTime: 100,
      sectionalMarks: [],
      runners: [
        {
          runnerIndex: 0,
          horseId: h.id,
          saddleCloth: 1,
          draw: 1,
          jockeyId: 'unknown-jockey',
          weightLb: 126,
          position: 1,
          finishTime: 100,
          margin: null,
          beatenLengths: 0,
          sectionals: [],
          performanceFigure: 0,
          odds: null,
        },
      ],
    });
    expect(horseRunRows(state, h.id)[0]).toMatchObject({
      name: race.name,
      placing: '1/1',
      weight: 126,
      rating: '70 → 75',
      jockey: '—',
      replayKey: null,
    });
    expect(horseRunRows(state, h.id)[0]!.prize).not.toBe('—');
    expect(horseRunRows(state, 'another-horse')).toEqual([]);
  });
  it('보관된 결과가 없는 말은 전적 행을 만들지 않는다', () => {
    expect(horseRunRows(fixture(), 'missing')).toEqual([]);
  });
});
