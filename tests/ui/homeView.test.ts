import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { bookingSeasonOf } from '../../src/engine/breeding/season';
import { getRaceTemplates, getSalesData } from '../../src/engine/data/staticData';
import { generateHorse } from '../../src/engine/horse/generate';
import { createRng } from '../../src/engine/rng';
import { createNewGame } from '../../src/engine/state/newGame';
import { addWeeks } from '../../src/engine/time/calendar';
import type { GameState, Horse, PlannedRace } from '../../src/engine/types';
import { briefingItems, homeTasks, homeView } from '../../src/ui/home/homeView';
import HomeScreen from '../../src/ui/home/HomeScreen';
import { HorseNavigation } from '../../src/ui/horse/HorseLink';

function fixture(): GameState {
  return createNewGame({
    seed: 20261017,
    playerName: '구름 마주',
    silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' },
  });
}

function addHorse(state: GameState, id: string, status: Horse['status'] = 'in_training'): Horse {
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
  return horse;
}

function renderHome(state: GameState): string {
  return renderToStaticMarkup(
    createElement(
      HorseNavigation.Provider,
      { value: { state, openHorse: () => {} } },
      createElement(HomeScreen, { state, onNavigate: () => {} }),
    ),
  );
}

/** 할 일이 없는 빈 상태(말 없음, 제안 없음)를 만든다 */
function quietState(): GameState {
  const state = fixture();
  for (const id of Object.keys(state.horses)) {
    if (state.horses[id]!.ownerId === state.playerOwnerId) delete state.horses[id];
  }
  state.seasonState.racePlans = {};
  state.stud.matingProposals = [];
  state.sales.sellProposals = [];
  return state;
}

describe('M6-U3 홈 브리핑 요약', () => {
  it('제안이 없으면 세 항목 모두 없음으로 보인다', () => {
    const state = quietState();
    expect(briefingItems(state).map((item) => [item.id, item.text])).toEqual([
      ['races', '없음'],
      ['matings', '없음'],
      ['sales', '없음'],
    ]);
  });

  it('다음 주 이내 출주 계획·교배 제안·판매 제안을 내 말만 센다', () => {
    const state = quietState();
    const horse = addHorse(state, 'brief-horse');
    const other = addHorse(state, 'brief-other');
    other.ownerId = 'someone-else';
    const mare = addHorse(state, 'brief-mare', 'broodmare');
    const season = bookingSeasonOf(state.date);
    expect(season).not.toBeNull();
    const plan = (id: string, weeks: number): PlannedRace => ({
      id,
      date: addWeeks(state.date, weeks),
      templateId: null,
      target: { kinds: ['maiden'], minDistance: 1200, maxDistance: 1800 },
      status: 'proposed',
      note: '테스트',
    });
    state.seasonState.racePlans = {
      [horse.id]: [plan('near', 1), plan('far', 5)],
      [other.id]: [plan('others', 0)],
    };
    state.stud.matingProposals = [
      { mareId: mare.id, season: season!, stallionId: 'x', alternatives: [], expectedFee: 0, note: '', status: 'proposed' },
      { mareId: mare.id, season: season! + 9, stallionId: 'x', alternatives: [], expectedFee: 0, note: '', status: 'proposed' },
    ];
    state.sales.sellProposals = [
      { horseId: horse.id, saleId: getSalesData().events[0]!.id, year: state.date.year, reserve: null, note: '', status: 'proposed' },
      { horseId: other.id, saleId: getSalesData().events[0]!.id, year: state.date.year, reserve: null, note: '', status: 'proposed' },
    ];
    const items = briefingItems(state);
    expect(items.map((item) => [item.id, item.count, item.text])).toEqual([
      ['races', 1, '1건'],
      ['matings', 1, '1두'],
      ['sales', 1, '1두'],
    ]);
  });
});

describe('M6-U3 홈 최근 결과 줄', () => {
  it('내 말 관점 한 줄에 착순·출주 두수·등급을 담고 우승마는 따로 둔다', () => {
    const state = quietState();
    const horse = addHorse(state, 'result-horse');
    const template = getRaceTemplates().find((r) => r.grade !== null)!;
    const runners = Array.from({ length: 11 }, (_, index) => ({
      horseId: index === 0 ? 'world-winner' : index === 4 ? horse.id : `field-${index}`,
      jockeyId: 'jockey',
      position: index + 1,
      runnerIndex: index,
      saddleCloth: index + 1,
      draw: index + 1,
      weightLb: 126,
      finishTime: 100 + index,
      margin: null,
      beatenLengths: index,
      sectionals: [],
      performanceFigure: 0,
      odds: null,
    }));
    state.raceResults = [{
      raceId: template.id,
      racecourseId: template.racecourseId,
      date: state.date,
      going: 'good',
      distance: 1600,
      seed: 1,
      winningTime: 100,
      sectionalMarks: [],
      runners,
    }] as GameState['raceResults'];
    const view = homeView(state);
    expect(view.resultRows).toHaveLength(1);
    expect(view.resultRows[0]).toMatchObject({
      horseId: horse.id,
      position: 5,
      fieldSize: 11,
      raceName: template.name,
      grade: template.grade,
      winnerName: 'world-winner',
    });
    const html = renderHome(state);
    expect(html).toContain('5착/11');
    expect(html).toContain('home-result');
    expect(html).toContain('우승 world-winner');
  });

  it('등급이 없는 레이스는 등급 배지를 만들지 않는다', () => {
    const state = quietState();
    const horse = addHorse(state, 'plain-horse');
    state.raceResults = [{
      raceId: 'generated-race-without-template',
      racecourseId: 'x',
      date: state.date,
      going: 'good',
      distance: 1600,
      seed: 1,
      winningTime: 100,
      sectionalMarks: [],
      runners: [{ horseId: horse.id, jockeyId: 'jockey', position: 2, runnerIndex: 0, saddleCloth: 1, draw: 1, weightLb: 126, finishTime: 100, margin: null, beatenLengths: 1, sectionals: [], performanceFigure: 0, odds: null }],
    }] as GameState['raceResults'];
    const row = homeView(state).resultRows[0]!;
    expect(row.grade).toBeNull();
    expect(row.fieldSize).toBe(1);
  });
});

describe('M6-U3 홈 최근 이벤트 필터', () => {
  it('출주 신청·레이스 결과·이름 짓기는 빼고 부상·출산·세일·목표 사건만 남긴다', () => {
    const state = quietState();
    const horse = addHorse(state, 'event-horse');
    const sale = getSalesData().events[0]!;
    state.eventLog = [
      { type: 'race_plan_declared', horseId: horse.id, raceId: 'r', date: state.date },
      { type: 'horse_named', horseId: horse.id, name: '이름', auto: false, date: state.date },
      { type: 'race_run', raceId: 'r', meetingId: 'm', winnerId: 'other', playerHorseIds: [horse.id], date: state.date },
      { type: 'horse_injured', horseId: horse.id, kind: 'tendon', weeksOut: 4, date: state.date },
      { type: 'foal_born', foalId: 'foal', mareId: horse.id, stallionId: 'other', date: state.date },
      { type: 'sale_lot_result', saleId: sale.id, year: state.date.year, lotNo: 1, horseId: horse.id, role: 'underbidder', result: { kind: 'withdrawn' }, date: state.date },
      { type: 'sale_lot_result', saleId: sale.id, year: state.date.year, lotNo: 2, horseId: horse.id, role: 'vendor', result: { kind: 'withdrawn' }, date: state.date },
      { type: 'horse_sold', horseId: 'elsewhere', fromOwnerId: state.playerOwnerId, toOwnerId: 'other', price: 1000, date: state.date },
      { type: 'sire_line_established', horseId: horse.id, lineId: 'line_x', date: state.date },
    ];
    // 남는 것: 부상·출산·세일 위탁(vendor)·player 말 판매·부계 확립. 최신순(목록 뒤에서부터)
    expect(homeView(state).events.map((e) => e.type)).toEqual([
      'sire_line_established',
      'horse_sold',
      'sale_lot_result',
      'foal_born',
      'horse_injured',
    ]);
  });
});

describe('M6-U3 홈 화면 문구', () => {
  it('할 일이 없으면 이번 주 브리핑 카드에 자동으로 일어날 일을 요약한다', () => {
    const state = quietState();
    expect(homeTasks(state)).toEqual([]);
    const html = renderHome(state);
    expect(html).toContain('이번 주 브리핑');
    expect(html).toContain('다음 진행 때 자동으로 일어날 일');
    expect(html).toContain('출주 예정');
    expect(html).toContain('교배 예약 예정');
    expect(html).toContain('판매 위탁 예정');
    expect(html).not.toContain('이번 주 할 일');
  });
});
