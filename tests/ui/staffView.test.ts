import { beforeAll, describe, expect, it } from 'vitest';
import { START_YEAR } from '../../src/engine/config/game';
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
import { relationKey } from '../../src/engine/economy/relations';
import { bootstrapGame, type BootstrapData } from '../../src/engine/state/bootstrap';
import type { GameState, RetainerContract } from '../../src/engine/types';
import { feeKo, retainerRefusalKo, type RetainerActionError } from '../../src/ui/game/text';
import { jockeyProfile, reputationView, staffRows, trainerProfile } from '../../src/ui/staff/staffView';

/** 원래 능력 수치 키. 프로필 결과에 나오면 안 된다(사용자 결정 2026-10-15) */
const HIDDEN_KEYS = /"(skill|eye|start|pace|finish|strength|staminaBias|juvenileFocus|facilityGrade|abilities)"/;
const GRADE_SET = new Set(['S', 'A', 'B', 'C', 'D', 'E']);

const SEED = 20261011;
const YEAR = START_YEAR;
const SILKS = { primary: '#1d4e89', secondary: '#ffd23f', pattern: 'hoops' } as const;
const BOOT_TIMEOUT = 600_000;
const CONTRACT_FEE = 92_000;

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

const ALL_REFUSAL_ERRORS: readonly RetainerActionError[] = [
  'not_found',
  'retired',
  'already_contracted',
  'slot_full',
  'retained_elsewhere',
  'relation_too_low',
  'standing_too_low',
  'insufficient_funds',
  'not_contracted',
];
const REFUSAL_TEXTS = new Set(ALL_REFUSAL_ERRORS.map((e) => retainerRefusalKo(e)));

let BASE: GameState;

beforeAll(() => {
  BASE = bootstrapGame({ seed: SEED, playerName: 'Test Owner', silks: { ...SILKS } }, BOOT_DATA);
}, BOOT_TIMEOUT);

function fresh(): GameState {
  return structuredClone(BASE);
}

/** 이름·id 순으로 정렬한 조교사 id 목록(테스트마다 같은 순서) */
function trainerIds(state: GameState): string[] {
  return Object.keys(state.trainers).sort();
}

function contractOf(personId: string): RetainerContract {
  return { kind: 'trainer', personId, startYear: YEAR, endYear: YEAR + 1, annualFee: CONTRACT_FEE };
}

describe('인맥 목록 기본', () => {
  it('조교사·기수 목록 길이가 사람 수와 같다', () => {
    const state = fresh();
    expect(staffRows(state, 'trainer').length).toBe(Object.keys(state.trainers).length);
    expect(staffRows(state, 'jockey').length).toBe(Object.keys(state.jockeys).length);
  });

  it('행 형식: 나이·관계 소수 1자리·등급 문구·제의 결과', () => {
    const state = fresh();
    for (const row of staffRows(state, 'trainer')) {
      expect(row.age).toBeGreaterThan(0);
      expect(Math.round(row.relation * 10) / 10).toBe(row.relation);
      expect(row.tierKo.length).toBeGreaterThan(0);
      expect(row.contractKo).toBeNull();
      if (row.quote.ok) {
        expect(row.quote.feeKo).toMatch(/^€[\d,]+$/);
      } else {
        expect(REFUSAL_TEXTS.has(row.quote.reasonKo)).toBe(true);
      }
    }
  });

  it('onlyKnown 이면 관계값이 있거나 전속인 사람만 남는다', () => {
    const state = fresh();
    const [first, second] = trainerIds(state);
    if (first === undefined || second === undefined) throw new Error('테스트 전제 위반: 조교사 부족');
    state.relations.values[relationKey('trainer', second)] = 25;
    state.relations.contracts.push(contractOf(first));
    const rows = staffRows(state, 'trainer', { onlyKnown: true });
    const ids = rows.map((r) => r.personId).sort();
    expect(ids).toEqual([first, second].sort());
  });
});

describe('전속 계약 표시와 정렬', () => {
  it('전속 계약 1건이 있으면 그 사람이 맨 위에 오고 계약 문구·거절 사유가 한국어로 나온다', () => {
    const state = fresh();
    const ids = trainerIds(state);
    const [contracted, higher, lower] = ids;
    if (contracted === undefined || higher === undefined || lower === undefined) {
      throw new Error('테스트 전제 위반: 조교사 부족');
    }
    state.relations.contracts.push(contractOf(contracted));
    // 전속이 아닌 두 사람 중 관계가 더 높은 쪽이 두 번째에 와야 한다
    state.relations.values[relationKey('trainer', higher)] = 60;
    state.relations.values[relationKey('trainer', lower)] = 10;
    state.relations.values[relationKey('trainer', contracted)] = 30;

    const rows = staffRows(state, 'trainer');
    expect(rows[0]?.personId).toBe(contracted);
    expect(rows[0]?.contractKo).toBe(`전속 (${YEAR + 1}년 말까지, 연 ${feeKo(CONTRACT_FEE)})`);
    expect(rows[0]?.quote).toEqual({ ok: false, reasonKo: retainerRefusalKo('already_contracted') });

    const second = rows[1];
    expect(second?.personId).toBe(higher);
    expect(second?.contractKo).toBeNull();
  });

  it('정렬 불변식: 전속 먼저, 전속이 아닌 행끼리는 관계값 내림차순', () => {
    const state = fresh();
    const rows = staffRows(state, 'trainer');
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1];
      const cur = rows[i];
      if (prev === undefined || cur === undefined) continue;
      expect(prev.contractKo === null || cur.contractKo !== null).toBe(true);
      if (prev.contractKo === null && cur.contractKo === null) {
        expect(prev.relation >= cur.relation).toBe(true);
      }
    }
  });

  it('제의 거절 사유는 모두 한국어 문구다', () => {
    for (const reason of ALL_REFUSAL_ERRORS) {
      expect(retainerRefusalKo(reason)).toMatch(/[가-힣]/);
    }
  });
});

describe('명성 표시', () => {
  function labelAt(value: number): { reputation: number; labelKo: string } {
    const state = fresh();
    state.relations.reputation = value;
    return reputationView(state);
  }

  it('구간 경계: 20 미만 무명, 40 미만 신진, 60 미만 중견, 80 미만 유력, 그 이상 명문', () => {
    expect(labelAt(0).labelKo).toBe('무명');
    expect(labelAt(19.9).labelKo).toBe('무명');
    expect(labelAt(20).labelKo).toBe('신진');
    expect(labelAt(39.9).labelKo).toBe('신진');
    expect(labelAt(40).labelKo).toBe('중견');
    expect(labelAt(60).labelKo).toBe('유력');
    expect(labelAt(80).labelKo).toBe('명문');
    expect(labelAt(100).labelKo).toBe('명문');
  });

  it('명성은 소수 1자리로 보이고, 등급도 보이는 값으로 정한다', () => {
    expect(labelAt(19.96)).toEqual({ reputation: 20, labelKo: '신진' });
    expect(labelAt(33.333)).toEqual({ reputation: 33.3, labelKo: '신진' });
  });
});

describe('기수·조교사 프로필 (M4-P1)', () => {
  it('없는 id 면 null', () => {
    const state = fresh();
    expect(jockeyProfile(state, 'jk-missing')).toBeNull();
    expect(trainerProfile(state, 'tr-missing')).toBeNull();
  });

  it('기수 프로필: 다섯 능력이 S~E 등급으로만 나오고, 원래 수치는 결과에 없다', () => {
    const state = fresh();
    const id = Object.keys(state.jockeys).sort()[0];
    if (id === undefined) throw new Error('테스트 전제 위반: 기수 없음');
    const jockey = state.jockeys[id];
    if (jockey === undefined) throw new Error('테스트 전제 위반');
    // 숫자 흔적이 남지 않도록 눈에 띄는 값을 넣는다
    jockey.abilities = { start: 41.7319, pace: 63.1187, finish: 77.2246, strength: 58.4031 };
    jockey.skill = 59.3404;

    const profile = jockeyProfile(state, id);
    expect(profile).not.toBeNull();
    if (profile === null) return;
    expect(profile.grades.map((g) => g.labelKo)).toEqual(['출발', '페이스', '마무리', '힘', '종합']);
    for (const g of profile.grades) expect(GRADE_SET.has(g.grade)).toBe(true);
    const json = JSON.stringify(profile);
    expect(HIDDEN_KEYS.test(json)).toBe(false);
    expect(json).not.toContain('41.7319');
    expect(json).not.toContain('59.3404');
    expect(profile.apprentice).toBe(jockey.apprenticeAllowanceLb > 0);
  });

  it('조교사 프로필: 등급 세 칸·성향 문구·원래 수치 키 없음', () => {
    const state = fresh();
    const id = trainerIds(state)[0];
    if (id === undefined) throw new Error('테스트 전제 위반: 조교사 없음');
    const trainer = state.trainers[id];
    if (trainer === undefined) throw new Error('테스트 전제 위반');
    trainer.eye = 66.6666;
    trainer.skill = 77.7777;

    const profile = trainerProfile(state, id);
    expect(profile).not.toBeNull();
    if (profile === null) return;
    expect(profile.grades.map((g) => g.labelKo)).toEqual(['조교', '상마안', '시설']);
    for (const g of profile.grades) expect(GRADE_SET.has(g.grade)).toBe(true);
    expect(profile.styleKo.length).toBeGreaterThan(0);
    expect(profile.staminaKo.length).toBeGreaterThan(0);
    expect(profile.juvenileKo.length).toBeGreaterThan(0);
    expect(profile.ownedHorseCount).toBe(
      Object.values(state.horses).filter((h) => h.ownerId === state.playerOwnerId && h.trainerId === id).length,
    );
    const json = JSON.stringify(profile);
    expect(HIDDEN_KEYS.test(json)).toBe(false);
    expect(json).not.toContain('66.6666');
    expect(json).not.toContain('77.7777');
  });

  it('시설 등급 1→E, 5→S 대응', () => {
    const state = fresh();
    const id = trainerIds(state)[0];
    if (id === undefined) throw new Error('테스트 전제 위반: 조교사 없음');
    const trainer = state.trainers[id];
    if (trainer === undefined) throw new Error('테스트 전제 위반');
    trainer.facilityGrade = 1;
    expect(trainerProfile(state, id)?.grades[2]?.grade).toBe('E');
    trainer.facilityGrade = 5;
    expect(trainerProfile(state, id)?.grades[2]?.grade).toBe('S');
  });

  it('성적 합계: 합계 출주 = 통산 + 올해, 출주 0 이면 승률은 null', () => {
    const state = fresh();
    const id = trainerIds(state)[0];
    if (id === undefined) throw new Error('테스트 전제 위반: 조교사 없음');
    const trainer = state.trainers[id];
    if (trainer === undefined) throw new Error('테스트 전제 위반');
    trainer.career = { runners: 100, wins: 20, places: 40, groupWins: 2, g1Wins: 1, earnings: 500_000 };
    state.seasonState.leading.trainer[id] = { id, runners: 10, wins: 3, places: 5, groupWins: 1, earnings: 30_000 };

    const profile = trainerProfile(state, id);
    expect(profile?.records.total.runners).toBe(110);
    expect(profile?.records.total.wins).toBe(23);
    expect(profile?.records.total.earnings).toBe(530_000);
    expect(profile?.records.total.g1Wins).toBe(1);
    expect(profile?.records.thisYear.g1Wins).toBeNull();
    expect(profile?.records.thisYear.winRatePct).toBe(30);
    expect(profile?.records.career.winRatePct).toBe(20);

    trainer.career = { runners: 0, wins: 0, places: 0, groupWins: 0, g1Wins: 0, earnings: 0 };
    delete state.seasonState.leading.trainer[id];
    expect(trainerProfile(state, id)?.records.thisYear.winRatePct).toBeNull();
  });

  it('잘 맞는 작전: null 이면 문구가 있고 한국어다', () => {
    const state = fresh();
    const id = Object.keys(state.jockeys).sort()[0];
    if (id === undefined) throw new Error('테스트 전제 위반: 기수 없음');
    const jockey = state.jockeys[id];
    if (jockey === undefined) throw new Error('테스트 전제 위반');
    jockey.preferredStyle = null;
    expect(jockeyProfile(state, id)?.preferredStyleKo).toMatch(/[가-힣]/);
    jockey.preferredStyle = 'held_up';
    expect(jockeyProfile(state, id)?.preferredStyleKo).toBe('추입');
  });
});
