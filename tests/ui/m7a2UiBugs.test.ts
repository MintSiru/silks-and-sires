import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createNewGame } from '../../src/engine/state/newGame';
import { generateHorse } from '../../src/engine/horse/generate';
import { createRng } from '../../src/engine/rng';
import { getRaceTemplates } from '../../src/engine/data/staticData';
import type {
  GameEvent,
  GameState,
  Horse,
  HorseStatus,
  PlannedRace,
  Race,
  ReplayableRace,
  RunnerResult,
} from '../../src/engine/types';
import { feeKo, statusKo } from '../../src/ui/game/text';
import { homeEventRows } from '../../src/ui/home/homeView';
import { horseRunRows, prizeOfRun } from '../../src/ui/horse/horseDetailView';
import {
  isSearchingTarget,
  planStatusView,
  racePlanRows,
  SEARCHING_LABEL,
} from '../../src/ui/season/racePlanView';

function fixture(): GameState {
  return createNewGame({
    seed: 20261017,
    playerName: '구름 마주',
    silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' },
  });
}

function addHorse(state: GameState, status: HorseStatus, id: string, ageYears = 3): Horse {
  const horse = generateHorse(createRng(id), {
    id,
    name: `구름 ${id}`,
    birthYear: state.date.year - ageYears,
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

/** 출주 결과 한 건(horseId 가 position 착, 나머지는 다른 말). 레이스 id 를 바꿀 수 있다. */
function addRunResult(state: GameState, raceId: string, racecourseId: string, distance: number, week: number, horseId: string, position: number): void {
  const runners: RunnerResult[] = Array.from({ length: 8 }, (_, i) => ({
    runnerIndex: i,
    horseId: i + 1 === position ? horseId : `rival-${raceId}-${i}`,
    saddleCloth: i + 1,
    draw: i + 1,
    jockeyId: 'unknown-jockey',
    weightLb: 126,
    position: i + 1,
    finishTime: 100 + i,
    margin: null,
    beatenLengths: i,
    sectionals: [],
    performanceFigure: 0,
    odds: null,
  }));
  state.raceResults.push({
    raceId,
    racecourseId,
    date: { year: state.date.year, week },
    going: 'good_to_firm',
    distance,
    seed: week,
    winningTime: 100,
    sectionalMarks: [],
    runners,
  });
}

function templateOf(predicate: (r: Race) => boolean): Race {
  const found = getRaceTemplates().find(predicate);
  if (found === undefined) throw new Error('테스트용 레이스 정의가 없다');
  return found;
}

describe('M7-A2 전적 탭: 자동 편성 레이스 상금·이름', () => {
  it('보관 목록에 있으면 실제 이름과 클래스 배지를 쓰고, 상금은 장부 항목을 쓴다', () => {
    const state = fixture();
    const horse = addHorse(state, 'in_training', 'maiden-horse');
    const genId = 'gen-2026-000001';
    const template = templateOf((r) => r.grade === null);
    addRunResult(state, genId, template.racecourseId, template.distance, 4, horse.id, 2);
    const replay: ReplayableRace = {
      meetingId: 'meeting-test',
      race: { ...template, id: genId, name: 'Ardvarrow Park Maiden Stakes', grade: null, raceClass: 5 },
      going: 'good_to_firm',
      date: { year: state.date.year, week: 4 },
      seed: 4,
      field: { runners: [] } as unknown as ReplayableRace['field'],
    };
    state.seasonState.replayable = [replay];
    state.economy.playerLedger.push({
      date: { year: state.date.year, week: 4 },
      category: 'prize',
      amount: 1980,
      horseId: horse.id,
    });
    const row = horseRunRows(state, horse.id)[0]!;
    expect(row.name).toBe('Ardvarrow Park Maiden Stakes');
    expect(row.gradeBadge).toBe('클래스 5');
    expect(row.prize).toBe(feeKo(1980));
  });

  it('보관 목록에서 밀린 자동 편성 레이스도 장부 상금은 보인다(€0 이 아니다)', () => {
    const state = fixture();
    const horse = addHorse(state, 'in_training', 'evicted-horse');
    const template = templateOf((r) => r.grade === null);
    addRunResult(state, 'gen-2026-000009', template.racecourseId, template.distance, 6, horse.id, 2);
    state.economy.playerLedger.push({
      date: { year: state.date.year, week: 6 },
      category: 'prize',
      amount: 1980,
      horseId: horse.id,
    });
    const row = horseRunRows(state, horse.id)[0]!;
    expect(row.name).toBe('자동 편성 레이스');
    expect(row.gradeBadge).toBeNull();
    expect(row.prize).toBe(feeKo(1980));
  });

  it('상금 항목이 없고 레이스 정의도 없으면 null 이다(표에는 —)', () => {
    const state = fixture();
    const horse = addHorse(state, 'in_training', 'no-prize-horse');
    expect(prizeOfRun(state, horse.id, state.date, 1, undefined)).toBeNull();
    const template = templateOf((r) => r.grade === null);
    // 레이스 정의가 있으면 상금 항목이 없어도 상금표를 본다(상금표 밖 착순은 0)
    expect(prizeOfRun(state, horse.id, state.date, 1, template)).toBe(template.prizeMoney[0]);
    expect(prizeOfRun(state, horse.id, state.date, template.prizeMoney.length + 1, template)).toBe(0);
  });
});

describe('M7-A2 출주 계획: 지난 조건 목표', () => {
  const target = { kinds: ['maiden' as const], minDistance: 1200, maxDistance: 1600, country: 'GB' as const };
  const plan = (status: PlannedRace['status'], week: number, targetOrNull: PlannedRace['target'] = target): PlannedRace => ({
    id: `p-${week}`,
    date: { year: 2026, week },
    templateId: null,
    target: targetOrNull,
    status,
    note: '',
  });

  it('날짜가 지난 조건 목표 제안·확정은 찾는 중 문구와 최대 주 수를 쓴다', () => {
    const now = { year: 2026, week: 10 };
    const rows = racePlanRows([plan('proposed', 8), plan('approved', 9)], { currentDate: now });
    expect(rows[0]).toMatchObject({ searching: true, statusLabel: `${SEARCHING_LABEL} (최대 2주)` });
    expect(rows[1]).toMatchObject({ searching: true, statusLabel: `${SEARCHING_LABEL} (최대 2주)` });
    expect(planStatusView('approved', false, true)).toEqual({ label: SEARCHING_LABEL, tone: 'warn' });
  });

  it('날짜가 안 지났거나 레이스가 정해진 계획, 현재 날짜가 없으면 찾는 중이 아니다', () => {
    const now = { year: 2026, week: 10 };
    expect(isSearchingTarget(plan('proposed', 10), now)).toBe(false);
    expect(isSearchingTarget(plan('proposed', 8, null), now)).toBe(false);
    expect(isSearchingTarget(plan('proposed', 8), undefined)).toBe(false);
    expect(isSearchingTarget(plan('run', 8), now)).toBe(false);
    const fixed = { ...plan('proposed', 8, null), templateId: getRaceTemplates()[0]!.id };
    expect(racePlanRows([fixed], { currentDate: now })[0]).toMatchObject({ searching: false });
    expect(racePlanRows([plan('proposed', 8)])[0]).toMatchObject({ searching: false });
  });
});

describe('M7-A2 상태 이름: 미입사', () => {
  it('yearling 은 1세면 1세, 2세 이상이면 미입사다', () => {
    expect(statusKo('yearling', 1)).toBe('1세');
    expect(statusKo('yearling', 2)).toBe('미입사');
    expect(statusKo('yearling', 3)).toBe('미입사');
    expect(statusKo('yearling')).toBe('1세');
    expect(statusKo('in_training', 2)).toBe('조교 중');
    expect(statusKo('broodmare', 5)).toBe('번식 암말');
  });
});

describe('M7-A2 홈 주요 사건', () => {
  it('세계 NH 스토어 세일은 빼고, 내 말 입상·첫 승·목장 구매를 넣는다', () => {
    const state = fixture();
    const mine = addHorse(state, 'in_training', 'mine');
    const g1 = templateOf((r) => r.grade === 'G1');
    const maiden = templateOf((r) => r.grade === null);
    addRunResult(state, g1.id, g1.racecourseId, g1.distance, 5, mine.id, 3);
    addRunResult(state, maiden.id, maiden.racecourseId, maiden.distance, 6, mine.id, 1);
    const events: GameEvent[] = [
      { type: 'nh_store_sold', horseId: 'foreign-horse', price: 1000, date: { year: 2026, week: 2 } },
      { type: 'nh_store_sold', horseId: mine.id, price: 2000, date: { year: 2026, week: 3 } },
      { type: 'farm_purchased', country: 'GB', size: 'small', price: 3000, date: { year: 2026, week: 3 } },
      { type: 'race_run', raceId: g1.id, meetingId: 'm1', winnerId: 'rival', playerHorseIds: [mine.id], date: { year: 2026, week: 5 } },
      { type: 'race_run', raceId: maiden.id, meetingId: 'm2', winnerId: mine.id, playerHorseIds: [mine.id], date: { year: 2026, week: 6 } },
    ];
    state.eventLog = events;
    const rows = homeEventRows(state, [mine.id]);
    expect(rows.some((r) => r.event.type === 'nh_store_sold' && r.event.horseId === 'foreign-horse')).toBe(false);
    expect(rows.some((r) => r.event.type === 'nh_store_sold' && r.event.horseId === mine.id)).toBe(true);
    expect(rows.some((r) => r.event.type === 'farm_purchased')).toBe(true);
    const placing = rows.find((r) => r.event.type === 'race_run' && r.event.raceId === g1.id);
    expect(placing?.line).toContain('3착');
    expect(placing?.line).toContain('G1');
    const firstWin = rows.find((r) => r.event.type === 'race_run' && r.event.raceId === maiden.id);
    expect(firstWin?.line).toContain('첫 승');
    expect(rows.length).toBeLessThanOrEqual(5);
  });

  it('플레이어가 판 말의 NH 스토어 세일은 장부 항목으로 알아보고 남긴다', () => {
    const state = fixture();
    state.eventLog = [
      { type: 'nh_store_sold', horseId: 'sold-by-me', price: 5000, date: { year: 2026, week: 7 } },
    ];
    state.economy.playerLedger.push({
      date: { year: 2026, week: 7 },
      category: 'nh_store_sale',
      amount: 5000,
      horseId: 'sold-by-me',
    });
    const rows = homeEventRows(state, []);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.line).toBeNull();
  });
});

describe('M7-A2 빌드 자산: favicon', () => {
  it('public/favicon.svg 가 있고 index.html 이 참조한다', () => {
    const svg = readFileSync(new URL('../../public/favicon.svg', import.meta.url), 'utf8');
    expect(svg).toContain('<svg');
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/favicon.svg" />');
  });
});
