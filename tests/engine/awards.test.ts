import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import racecoursesJson from './fixtures/m1-racecourses.json';
import { WEEKS_PER_YEAR } from '../../src/engine/config/game';
import {
  getHorseWords,
  getNicks,
  getPeopleData,
  getStallionNames,
  getStallionRecords,
} from '../../src/engine/data/staticData';
import { createRng } from '../../src/engine/rng';
import {
  type AwardsSource,
  computeBestRace,
  computeGlobalRankings,
  computeLedger,
  computeSeasonAwards,
  hadRacesIn,
  leadingTop,
  ledgerRating,
  rankLedger,
} from '../../src/engine/season/awards';
import { loadRacecourses } from '../../src/engine/course/load';
import { createEmptySeasonState } from '../../src/engine/season/state';
import { bootstrapGame, type BootstrapData } from '../../src/engine/state/bootstrap';
import { createGameSystems, type GameStaticData } from '../../src/engine/state/systems';
import { advanceWeek } from '../../src/engine/time/advance';
import type {
  GameState,
  Horse,
  HorseId,
  LeadingEntry,
  LeadingTables,
  PerformanceEntry,
  Racecourse,
  RaceGrade,
  RaceRatingEntry,
  RaceTemplate,
  SeasonState,
  SeriesDefinition,
} from '../../src/engine/types';

const YEAR = 2026;
const SEED = 20261012;
const START_YEAR = 2026;
const SILKS = { primary: '#1d4e89', secondary: '#ffd23f', pattern: 'hoops' } as const;
/** 긴 진행 테스트용 제한 시간(ms). 52주 진행 두 번 + 부트스트랩을 포함한다 */
const LONG_TIMEOUT = 600_000;
const MID_TIMEOUT = 120_000;

// ── 합성 데이터 헬퍼 ────────────────────────────────────────────────

/** 시상 계산에 필요한 필드만 가진 말(나머지 필드는 계산에 쓰지 않는다) */
function fakeHorse(id: HorseId, sex: 'male' | 'female', birthYear: number): Horse {
  return { id, sex, birthYear, gelded: false } as Horse;
}

function sourceOf(horses: Horse[], seasonState: SeasonState = createEmptySeasonState(YEAR)): AwardsSource {
  const map: Record<HorseId, Horse> = {};
  for (const h of horses) map[h.id] = h;
  return { horses: map, raceResults: [], seasonState };
}

interface RunOpts {
  grade: RaceGrade | null;
  position: number;
  pr: number;
  distance?: number;
  week?: number;
  year?: number;
}

/** 말 한 두의 출주 기록 한 줄을 추가한다. raceId 는 말 id + 순번 */
function addRun(season: SeasonState, horseId: HorseId, o: RunOpts): void {
  const list = season.performances[horseId] ?? [];
  const entry: PerformanceEntry = {
    raceId: `${horseId}-r${list.length + 1}`,
    templateId: null,
    date: { year: o.year ?? YEAR, week: o.week ?? 10 },
    grade: o.grade,
    distance: o.distance ?? 2000,
    country: 'GB',
    position: o.position,
    pr: o.pr,
  };
  list.push(entry);
  season.performances[horseId] = list;
}

/**
 * 세 단체 결과가 갈리는 합성 시즌.
 * A: G1 3연승(PR 118·117·116) → Laurel 올해의 말
 * B: G1 4착 PR 136 한 번 + 무등급 PR 90 → Global 1위(한 번의 큰 퍼포먼스)
 * C: G1 5착을 6번, PR 130 꾸준 → Ledger 1위(꾸준함). 그룹 1승이 없어 올해의 말 자격 없음
 */
function divergenceSeason(): SeasonState {
  const s = createEmptySeasonState(YEAR);
  addRun(s, 'A', { grade: 'G1', position: 1, pr: 118 });
  addRun(s, 'A', { grade: 'G1', position: 1, pr: 117 });
  addRun(s, 'A', { grade: 'G1', position: 1, pr: 116 });
  addRun(s, 'B', { grade: 'G1', position: 4, pr: 136 });
  addRun(s, 'B', { grade: null, position: 6, pr: 90, distance: 1200 });
  for (let i = 0; i < 6; i++) addRun(s, 'C', { grade: 'G1', position: 5, pr: 130 });
  return s;
}

function divergenceHorses(): Horse[] {
  return [fakeHorse('A', 'male', 2022), fakeHorse('B', 'male', 2022), fakeHorse('C', 'male', 2021)];
}

function leadingEntry(id: string, wins: number, earnings: number, runners: number): LeadingEntry {
  return { id, wins, earnings, runners, places: 0, groupWins: 0 };
}

function emptyTables(): LeadingTables {
  return { sire: {}, damsire: {}, jockey: {}, trainer: {}, owner: {}, breeder: {} };
}

// ── 단위 검사 ───────────────────────────────────────────────────────

describe('ledgerRating (The Racing Ledger)', () => {
  it('1. [130, 128] → base 129 → 139, [110, 104] → 109, [95] → 93, 상한 150 을 넘지 않는다, 출주 없으면 null', () => {
    expect(ledgerRating([130, 128])).toBe(139);
    expect(ledgerRating([110, 104])).toBe(109);
    expect(ledgerRating([95])).toBe(93);
    expect(ledgerRating([200, 200])).toBe(150);
    expect(ledgerRating([])).toBeNull();
  });
});

describe('세 단체 결과 갈림 (합성 시즌)', () => {
  it('2. 올해의 말(Laurel) = G1 다승마, Global 1위 = 한 번의 큰 퍼포먼스, Ledger 1위 = 꾸준한 말', () => {
    const src = sourceOf(divergenceHorses(), divergenceSeason());
    const before = structuredClone(src);
    const awards = computeSeasonAwards(src, YEAR, createRng(SEED));

    expect(src).toEqual(before);
    expect(awards.year).toBe(YEAR);
    expect(awards.laurel.horse_of_the_year).toBe('A');
    expect(awards.globalRankings.map((r) => r.horseId)).toEqual(['B', 'C', 'A']);
    expect(awards.globalRankings[0]).toEqual({ horseId: 'B', rating: 136 });
    expect(awards.ledger.map((r) => r.horseId)).toEqual(['C', 'A', 'B']);
    expect(awards.ledger[0]).toEqual({ horseId: 'C', rating: 140 });
    expect(awards.ledger[1]).toEqual({ horseId: 'A', rating: 124 });
    expect(awards.ledger[2]).toEqual({ horseId: 'B', rating: 118 });
  });

  it('2b. 같은 시드면 Laurel 결과와 모든 시상이 같다', () => {
    const src = sourceOf(divergenceHorses(), divergenceSeason());
    const a = computeSeasonAwards(src, YEAR, createRng(SEED));
    const b = computeSeasonAwards(src, YEAR, createRng(SEED));
    expect(b).toEqual(a);
  });
});

describe('부문 자격 (Laurel)', () => {
  it('3. 2세 암말은 two_year_old_filly 에만, 4세 스테이어는 older_horse·stayer 에 들어가고, 자격 없는 부문은 null', () => {
    const s = createEmptySeasonState(YEAR);
    // F2: 2세 암말, 1400m G3 우승
    addRun(s, 'F2', { grade: 'G3', position: 1, pr: 110, distance: 1400 });
    // M2: 2세 수말, 1600m G2 우승
    addRun(s, 'M2', { grade: 'G2', position: 1, pr: 108, distance: 1600 });
    // S4: 4세 수말, 3000m G1 우승 + 2000m G2 5착 → 2800m 이상 절반, 그 거리 그룹 입상
    addRun(s, 'S4', { grade: 'G1', position: 1, pr: 120, distance: 3000 });
    addRun(s, 'S4', { grade: 'G2', position: 5, pr: 105, distance: 2000 });
    const src = sourceOf(
      [fakeHorse('F2', 'female', 2024), fakeHorse('M2', 'male', 2024), fakeHorse('S4', 'male', 2022)],
      s,
    );
    const { laurel } = computeSeasonAwards(src, YEAR, createRng(SEED));

    expect(laurel.two_year_old_filly).toBe('F2');
    expect(laurel.two_year_old_colt).toBe('M2');
    expect(laurel.three_year_old_colt).toBeNull();
    expect(laurel.three_year_old_filly).toBeNull();
    expect(laurel.older_horse).toBe('S4');
    expect(laurel.stayer).toBe('S4');
    expect(laurel.sprinter).toBeNull();
  });

  it('3b. 스프린터: 그룹·리스티드 출주 중 1300m 이하가 절반 미만이면 자격 없음, 절반 이상이고 입상하면 자격', () => {
    const s = createEmptySeasonState(YEAR);
    // X: 1200m 1/3 뿐 → 자격 없음(점수는 가장 높게 설계)
    addRun(s, 'X', { grade: 'G3', position: 1, pr: 110, distance: 1200 });
    addRun(s, 'X', { grade: 'G2', position: 2, pr: 106, distance: 1600 });
    addRun(s, 'X', { grade: 'G1', position: 3, pr: 110, distance: 2000 });
    // Y: 1200m 2/3, 그 거리 G3 우승 → 스프린터
    addRun(s, 'Y', { grade: 'G3', position: 1, pr: 104, distance: 1200 });
    addRun(s, 'Y', { grade: 'G3', position: 3, pr: 100, distance: 1200 });
    addRun(s, 'Y', { grade: 'G2', position: 5, pr: 100, distance: 2000 });
    const src = sourceOf([fakeHorse('X', 'male', 2021), fakeHorse('Y', 'male', 2021)], s);
    const { laurel } = computeSeasonAwards(src, YEAR, createRng(SEED));
    expect(laurel.sprinter).toBe('Y');
    expect(laurel.stayer).toBeNull();
  });
});

describe('bestRace (최우수 레이스)', () => {
  it('4. G1 중 레이팅 최고, 다른 해·G2 는 제외, G1 이 없으면 null', () => {
    const s = createEmptySeasonState(YEAR);
    const race = (raceId: string, grade: RaceGrade, rating: number, year: number, week: number): RaceRatingEntry => ({
      raceId,
      templateId: null,
      name: raceId,
      date: { year, week },
      grade,
      country: 'GB',
      rating,
    });
    s.raceRatings = [
      race('g2-x', 'G2', 135, YEAR, 8),
      race('g1-a', 'G1', 125, YEAR, 12),
      race('g1-b', 'G1', 128, YEAR, 20),
      race('g1-old', 'G1', 150, YEAR - 1, 20),
    ];
    expect(computeBestRace(sourceOf([], s), YEAR)?.raceId).toBe('g1-b');

    const onlyG2 = createEmptySeasonState(YEAR);
    onlyG2.raceRatings = [race('g2-x', 'G2', 135, YEAR, 8)];
    expect(computeBestRace(sourceOf([], onlyG2), YEAR)).toBeNull();
  });
});

describe('리딩 상위 (leadingTop)', () => {
  it('5. 카테고리별 최대 20개, 승수 → 상금 → 출주 → id 순, 같은 값이면 id 오름차순', () => {
    const jockey: Record<string, LeadingEntry> = {};
    for (let i = 0; i < 22; i++) {
      const id = `j-${String(i).padStart(2, '0')}`;
      jockey[id] = leadingEntry(id, 1, 1000 - i * 10, 10);
    }
    jockey['j-hot'] = leadingEntry('j-hot', 3, 100, 5);
    jockey['j-tie-b'] = leadingEntry('j-tie-b', 1, 500, 4);
    jockey['j-tie-a'] = leadingEntry('j-tie-a', 1, 500, 4);
    const tables: LeadingTables = { ...emptyTables(), jockey };

    const top = leadingTop(tables);
    expect(top.jockey).toHaveLength(20);
    expect(top.jockey[0]?.id).toBe('j-hot');
    expect(top.jockey[1]?.id).toBe('j-00');
    expect(top.jockey[19]?.id).toBe('j-18');
    expect(top.jockey.some((e) => e.id === 'j-tie-a')).toBe(false);

    const tie: Record<string, LeadingEntry> = {
      'k-b': leadingEntry('k-b', 2, 300, 3),
      'k-a': leadingEntry('k-a', 2, 300, 3),
    };
    expect(leadingTop({ ...emptyTables(), owner: tie }).owner.map((e) => e.id)).toEqual(['k-a', 'k-b']);
  });

  it('5b. 나라별 리딩도 같은 규칙으로 상위 20개를 만든다', () => {
    const s = createEmptySeasonState(YEAR);
    const jockey: Record<string, LeadingEntry> = {};
    for (let i = 0; i < 25; i++) {
      const id = `gb-${String(i).padStart(2, '0')}`;
      jockey[id] = leadingEntry(id, 25 - i, 1000, 10);
    }
    s.leadingByCountry = { GB: { ...emptyTables(), jockey } };
    const awards = computeSeasonAwards(sourceOf([], s), YEAR, createRng(SEED));
    const gb = awards.leadingByCountry.GB;
    expect(gb?.jockey).toHaveLength(20);
    expect(gb?.jockey[0]?.id).toBe('gb-00');
    expect(gb?.jockey[19]?.id).toBe('gb-19');
  });
});

describe('ledger 목록·Global 목록 크기와 정렬', () => {
  it('Ledger·Global 은 말 한 두당 한 줄이고 레이팅 내림차순이다', () => {
    const src = sourceOf(divergenceHorses(), divergenceSeason());
    const ranked = rankLedger(src, YEAR);
    expect(computeLedger(src, YEAR)).toEqual(ranked.slice(0, 50));
    const global = computeGlobalRankings(src, YEAR);
    for (let i = 1; i < global.length; i++) {
      expect(global[i - 1]?.rating ?? 0).toBeGreaterThanOrEqual(global[i]?.rating ?? 0);
    }
  });
});

describe('시리즈 챔피언·직전 해 결과 여부', () => {
  it('seriesChampions 는 그 해 챔피언이 확정된 시리즈만 담는다', () => {
    const s = createEmptySeasonState(YEAR);
    const progress = (seriesId: string, year: number, champion: HorseId | null) => ({
      seriesId,
      year,
      legWinners: {},
      points: {},
      champion,
    });
    s.series = {
      'crown-a': progress('crown-a', YEAR, 'A'),
      'crown-old': progress('crown-old', YEAR - 1, 'B'),
      'points-open': progress('points-open', YEAR, null),
    };
    const awards = computeSeasonAwards(sourceOf([], s), YEAR, createRng(SEED));
    expect(awards.seriesChampions).toEqual({ 'crown-a': 'A' });
  });

  it('hadRacesIn: 올해 기록·결과·리딩 중 하나라도 있으면 true, 아무것도 없으면 false', () => {
    expect(hadRacesIn(sourceOf([]), YEAR)).toBe(false);

    const withLeading = createEmptySeasonState(YEAR);
    withLeading.leading.jockey['j-1'] = leadingEntry('j-1', 0, 0, 1);
    expect(hadRacesIn(sourceOf([], withLeading), YEAR)).toBe(true);

    const withRun = createEmptySeasonState(YEAR);
    addRun(withRun, 'A', { grade: null, position: 3, pr: 80 });
    expect(hadRacesIn(sourceOf([], withRun), YEAR)).toBe(true);

    const oldOnly = createEmptySeasonState(YEAR - 1);
    addRun(oldOnly, 'A', { grade: null, position: 3, pr: 80, year: YEAR - 1 });
    expect(hadRacesIn(sourceOf([], oldOnly), YEAR)).toBe(false);
  });
});

// ── 52주 통합 ───────────────────────────────────────────────────────

const COURSES: Racecourse[] = loadRacecourses(racecoursesJson);

function courseOf(id: string): Racecourse {
  const c = COURSES.find((x) => x.id === id);
  if (c === undefined) throw new Error(`fixture 에 ${id} 없음`);
  return c;
}

function layoutOf(course: Racecourse, distance: number): string {
  const cd = course.distances.find((d) => d.distance === distance);
  if (cd === undefined) throw new Error(`${course.id} 에 ${distance}m 없음`);
  return cd.layoutId;
}

/** 테스트용 G1 템플릿(가상 이름). season.test 와 같은 구성 */
function g1Template(
  id: string,
  courseId: string,
  distance: number,
  schedule: RaceTemplate['schedule'],
  name: string,
): RaceTemplate {
  const course = courseOf(courseId);
  return {
    id,
    name,
    racecourseId: course.id,
    distance,
    layoutId: layoutOf(course, distance),
    kind: 'group',
    grade: 'G1',
    raceClass: 1,
    conditions: {
      minAge: 3,
      maxAge: null,
      sex: 'open',
      ratingMin: null,
      ratingMax: null,
      weightSystem: 'wfa',
      baseWeightLb: 126,
    },
    prizeMoney: [200000, 70000, 35000, 15000],
    maxRunners: 14,
    schedule,
    cardOrder: 1,
    tags: ['classic'],
  };
}

const G1_A_ID = 'test-g1-ashcombe';
const G1_B_ID = 'test-g1-saint';
const CROWN_ID = 'test-crown';
const POINTS_ID = 'test-points';

const TEMPLATES: RaceTemplate[] = [
  g1Template(G1_A_ID, 'ashcombe', 2012, { month: 4, weekOfMonth: 2 }, 'Test Group One Ashcombe'),
  g1Template(G1_B_ID, 'saint_ourens', 2000, { month: 6, weekOfMonth: 1 }, 'Test Group One Saint'),
];

const SERIES: SeriesDefinition[] = [
  {
    id: CROWN_ID,
    nameKey: 'test.crown',
    kind: 'crown',
    legs: [G1_A_ID, G1_B_ID],
    winsRequired: 2,
    bonus: 100_000,
  },
  {
    id: POINTS_ID,
    nameKey: 'test.points',
    kind: 'points',
    legs: [G1_A_ID, G1_B_ID],
    pointsByPosition: [10, 6, 4, 3, 2, 1],
    bonus: 50_000,
  },
];

const STATIC_GAME: GameStaticData = {
  nicks: getNicks(),
  words: getHorseWords(),
  stallionRecords: getStallionRecords(),
  courses: COURSES,
  templates: TEMPLATES,
  series: SERIES,
};

const BOOT_DATA: BootstrapData = {
  stallionRecords: getStallionRecords(),
  stallionNames: getStallionNames(),
  nicks: getNicks(),
  words: getHorseWords(),
  ...getPeopleData(),
  courses: COURSES,
  templates: TEMPLATES,
  series: SERIES,
};

function boot(seed = SEED): GameState {
  return bootstrapGame({ seed, playerName: 'Test Owner', silks: { ...SILKS } }, BOOT_DATA);
}

/** 주 시스템 전체를 n 주 진행한다(입력 state 는 바꾸지 않는다) */
function step(state: GameState, weeks: number): GameState {
  const systems = createGameSystems(STATIC_GAME);
  let current = state;
  for (let i = 0; i < weeks; i++) {
    current = advanceWeek(current, systems).state;
  }
  return current;
}

describe('연도 전환 시상 (52주 통합, createGameSystems + advanceWeek)', () => {
  let BASE: GameState;

  beforeAll(() => {
    BASE = boot(SEED);
  }, MID_TIMEOUT);

  it('6. 2026년 1주 → 2027년 1주: awardsHistory 1건(2026), awards_announced 1건, 올해 기록 비움, 같은 시드 재현', () => {
    const systems = createGameSystems(STATIC_GAME);
    const yearEnd = step(BASE, WEEKS_PER_YEAR);
    expect(yearEnd.date).toEqual({ year: START_YEAR + 1, week: 1 });
    expect(yearEnd.awardsHistory).toEqual([]);

    // 2027년 1주 처리에서 연도 전환(시상 확정)이 일어난다
    const turn = advanceWeek(yearEnd, systems);
    const state = turn.state;

    // 구조 검사
    expect(state.awardsHistory).toHaveLength(1);
    expect(state.awardsHistory[0]?.year).toBe(START_YEAR);
    const announced = turn.events.filter((e) => e.type === 'awards_announced');
    expect(announced).toEqual([{ type: 'awards_announced', year: START_YEAR, date: { year: START_YEAR + 1, week: 1 } }]);
    expect(state.seasonState.year).toBe(START_YEAR + 1);
    // 올해(2026) 기록은 남지 않는다
    expect(Object.values(state.seasonState.performances).flat().some((e) => e.date.year === START_YEAR)).toBe(false);
    expect(state.seasonState.raceRatings.some((r) => r.date.year === START_YEAR)).toBe(false);

    // 같은 시드 재현
    const again = advanceWeek(step(boot(SEED), WEEKS_PER_YEAR), systems).state;
    expect(again).toEqual(state);

    // 수치 보고용(수치는 E1a 기록 작성 여부에 따라 달라진다)
    const awards = state.awardsHistory[0];
    if (awards !== undefined) {
      const ledgerTop = awards.ledger[0];
      const globalTop = awards.globalRankings[0];
      const hoy = awards.laurel.horse_of_the_year;
      console.log(
        `[awards] 2026 Ledger 1위 ${ledgerTop?.horseId ?? '-'} ${ledgerTop?.rating ?? '-'}, ` +
          `Global 1위 ${globalTop?.horseId ?? '-'} ${globalTop?.rating ?? '-'}, ` +
          `Laurel 올해의 말 ${hoy ?? '-'} (Ledger 1위와 같음: ${hoy !== null && hoy === ledgerTop?.horseId})`,
      );
    }
  }, LONG_TIMEOUT);
});

describe('엔진 순수성', () => {
  it('awards 관련 엔진 파일에 Math.random · Date.now 가 없다', () => {
    const files = ['src/engine/season/awards.ts', 'src/engine/config/awards.ts', 'src/engine/season/system.ts'];
    for (const file of files) {
      const text = readFileSync(resolve(process.cwd(), file), 'utf8');
      expect(text, file).not.toContain('Math.random');
      expect(text, file).not.toContain('Date.now');
    }
  });
});
