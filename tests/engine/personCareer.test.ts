import { describe, expect, it } from 'vitest';
import { START_YEAR } from '../../src/engine/config/game';
import {
  CAREER_JITTER,
  CAREER_JOCKEY_RIDES_PER_YEAR,
  CAREER_SKILL_OFFSET,
} from '../../src/engine/config/people';
import {
  getNamingData,
  getNicks,
  getPeopleData,
  getRaceTemplates,
  getRacecourses,
  getSeriesDefinitions,
  getStallionNames,
  getStallionRecords,
} from '../../src/engine/data/staticData';
import { emptyCareer, initialCareer } from '../../src/engine/people/generate';
import type { PersonCareer } from '../../src/engine/types';
import { bootstrapGame, type BootstrapData } from '../../src/engine/state/bootstrap';
import { createGameSystems, type GameStaticData } from '../../src/engine/state/systems';
import { advanceWeek } from '../../src/engine/time/advance';

const SEED = 20261015;
const SILKS = { primary: '#1d4e89', secondary: '#ffd23f', pattern: 'hoops' } as const;
/** 1년 진행 테스트의 상한 시간(ms). 실데이터 부트스트랩 + 52주 진행 */
const YEAR_TIMEOUT = 600_000;
/** 한 해 안전 상한 주차(무한 루프 방지) */
const MAX_WEEKS = 60;

const STATIC_GAME: GameStaticData = {
  nicks: getNicks(),
  naming: getNamingData(),
  stallionNames: getStallionNames(),
  stallionRecords: getStallionRecords(),
  courses: getRacecourses(),
  templates: getRaceTemplates(),
  series: getSeriesDefinitions(),
};

const BOOT_DATA: BootstrapData = {
  stallionRecords: getStallionRecords(),
  stallionNames: getStallionNames(),
  nicks: getNicks(),
  naming: getNamingData(),
  ...getPeopleData(),
  courses: getRacecourses(),
  templates: getRaceTemplates(),
  series: getSeriesDefinitions(),
};

/** 통산 성적의 포함 관계와 정수성 */
function expectConsistent(c: PersonCareer): void {
  for (const value of Object.values(c)) expect(Number.isInteger(value)).toBe(true);
  expect(c.wins).toBeLessThanOrEqual(c.runners);
  expect(c.places).toBe(c.wins * 2);
  expect(c.groupWins).toBeLessThanOrEqual(c.wins);
  expect(c.g1Wins).toBeLessThanOrEqual(c.groupWins);
  expect(c.earnings).toBeGreaterThanOrEqual(0);
}

describe('초기 통산 성적 (initialCareer)', () => {
  it('활동 연수가 0 이하면 빈 성적이다', () => {
    expect(initialCareer('jk-000001', 70, 0, CAREER_JOCKEY_RIDES_PER_YEAR)).toEqual(emptyCareer());
    expect(initialCareer('jk-000001', 70, -3, CAREER_JOCKEY_RIDES_PER_YEAR)).toEqual(emptyCareer());
  });

  it('같은 입력이면 같은 값이고, 모든 값은 정수이며 포함 관계가 맞다', () => {
    for (const id of ['jk-000001', 'jk-000002', 'tr-000007']) {
      for (const skill of [0, 20, 55, 90, 100]) {
        const a = initialCareer(id, skill, 12, CAREER_JOCKEY_RIDES_PER_YEAR);
        expect(initialCareer(id, skill, 12, CAREER_JOCKEY_RIDES_PER_YEAR)).toEqual(a);
        expectConsistent(a);
      }
    }
  });

  it('능력이 높을수록 같은 연수에서 승수와 상금이 많다', () => {
    const weak = initialCareer('jk-000010', 30, 15, CAREER_JOCKEY_RIDES_PER_YEAR);
    const strong = initialCareer('jk-000010', 85, 15, CAREER_JOCKEY_RIDES_PER_YEAR);
    expect(strong.wins).toBeGreaterThan(weak.wins);
    expect(strong.earnings).toBeGreaterThan(weak.earnings);
  });

  it('출주 수는 연간 기준 × (오프셋 + 능력 비율) 에서 ±흔들림 안에 든다', () => {
    const years = 10;
    const skill = 60;
    const base = years * CAREER_JOCKEY_RIDES_PER_YEAR * (CAREER_SKILL_OFFSET + skill / 100);
    for (const id of ['jk-000001', 'jk-000002', 'jk-000003', 'jk-000004']) {
      const c = initialCareer(id, skill, years, CAREER_JOCKEY_RIDES_PER_YEAR);
      expect(c.runners).toBeGreaterThanOrEqual(Math.floor(base * (1 - CAREER_JITTER)));
      expect(c.runners).toBeLessThanOrEqual(Math.ceil(base * (1 + CAREER_JITTER)));
    }
  });

  it('ID 가 다르면 해시 흔들림이 달라 출주 수가 다르다', () => {
    const a = initialCareer('jk-000001', 60, 10, CAREER_JOCKEY_RIDES_PER_YEAR);
    const b = initialCareer('jk-000002', 60, 10, CAREER_JOCKEY_RIDES_PER_YEAR);
    expect(a.runners).not.toBe(b.runners);
  });
});

describe('연말 누적 (startNewSeason)', () => {
  it(
    '52주 진행 후 새해 첫 주에 기수·조교사의 통산 성적이 지난해 리딩만큼 늘어나고, G1 승은 기수만 센다',
    () => {
      const systems = createGameSystems(STATIC_GAME);
      let state = bootstrapGame({ seed: SEED, playerName: 'Test Owner', silks: { ...SILKS } }, BOOT_DATA);
      let weeks = 0;
      // 새해 첫 주가 아직 실행되기 전 상태(date = START_YEAR+1 · 1주)까지 진행
      while (!(state.date.year === START_YEAR + 1 && state.date.week === 1)) {
        if (weeks++ > MAX_WEEKS) throw new Error('테스트 전제 위반: 새해 첫 주에 도달하지 못했다');
        state = advanceWeek(state, systems).state;
      }
      const before = state;
      const after = advanceWeek(before, systems).state;

      const g1TemplateIds = new Set(getRaceTemplates().filter((t) => t.grade === 'G1').map((t) => t.id));
      const g1ByJockey: Record<string, number> = {};
      for (const result of before.raceResults) {
        if (result.date.year !== START_YEAR || !g1TemplateIds.has(result.raceId)) continue;
        for (const runner of result.runners) {
          if (runner.position === 1) g1ByJockey[runner.jockeyId] = (g1ByJockey[runner.jockeyId] ?? 0) + 1;
        }
      }

      const jockeyIds = Object.keys(before.seasonState.leading.jockey);
      const trainerIds = Object.keys(before.seasonState.leading.trainer);
      const firstJockey = jockeyIds[0];
      const firstTrainer = trainerIds[0];
      if (firstJockey === undefined || firstTrainer === undefined) {
        throw new Error('테스트 전제 위반: 지난해 리딩이 비어 있다');
      }

      // 기수 한 명 검사(리딩 전 항목 + G1 승)
      const jEntry = before.seasonState.leading.jockey[firstJockey];
      if (jEntry === undefined) throw new Error('테스트 전제 위반: 기수 리딩 항목 없음');
      const jBefore = before.jockeys[firstJockey]?.career;
      const jAfter = after.jockeys[firstJockey]?.career;
      if (jBefore === undefined || jAfter === undefined) throw new Error('기수 통산 성적 없음');
      expect(jAfter.runners).toBe(jBefore.runners + jEntry.runners);
      expect(jAfter.wins).toBe(jBefore.wins + jEntry.wins);
      expect(jAfter.places).toBe(jBefore.places + jEntry.places);
      expect(jAfter.groupWins).toBe(jBefore.groupWins + jEntry.groupWins);
      expect(jAfter.earnings).toBe(jBefore.earnings + jEntry.earnings);
      expect(jAfter.g1Wins).toBe(jBefore.g1Wins + (g1ByJockey[firstJockey] ?? 0));

      // 조교사 한 명 검사(G1 승은 결과에 조교사 id 가 없어 0 증가)
      const tEntry = before.seasonState.leading.trainer[firstTrainer];
      if (tEntry === undefined) throw new Error('테스트 전제 위반: 조교사 리딩 항목 없음');
      const tBefore = before.trainers[firstTrainer]?.career;
      const tAfter = after.trainers[firstTrainer]?.career;
      if (tBefore === undefined || tAfter === undefined) throw new Error('조교사 통산 성적 없음');
      expect(tAfter.runners).toBe(tBefore.runners + tEntry.runners);
      expect(tAfter.wins).toBe(tBefore.wins + tEntry.wins);
      expect(tAfter.earnings).toBe(tBefore.earnings + tEntry.earnings);
      expect(tAfter.g1Wins).toBe(tBefore.g1Wins);

      // 모든 기수·조교사에 대해 누적 식이 맞는다
      for (const id of jockeyIds) {
        const entry = before.seasonState.leading.jockey[id];
        const b = before.jockeys[id]?.career;
        const a = after.jockeys[id]?.career;
        if (entry === undefined || b === undefined || a === undefined) continue;
        expect(a.runners).toBe(b.runners + entry.runners);
      }
      for (const id of trainerIds) {
        const entry = before.seasonState.leading.trainer[id];
        const b = before.trainers[id]?.career;
        const a = after.trainers[id]?.career;
        if (entry === undefined || b === undefined || a === undefined) continue;
        expect(a.runners).toBe(b.runners + entry.runners);
      }
    },
    YEAR_TIMEOUT,
  );
});
