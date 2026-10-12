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
import { reputationView, staffRows } from '../../src/ui/staff/staffView';

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
