import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { getNamingData, getNicks, getPeopleData, getRaceTemplates, getRacecourses, getSeriesDefinitions, getStallionNames, getStallionRecords } from '../../src/engine/data/staticData';
import { bootstrapGame, type BootstrapData } from '../../src/engine/state/bootstrap';
import { meanAbility, ratingFromAbility } from '../../src/engine/world/rating';
import type { GameState, Horse } from '../../src/engine/types';

const MID_TIMEOUT = 600_000;
const SEED = 20261011;
const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);
const SILKS = { primary: '#1d4e89', secondary: '#ffd23f', pattern: 'hoops' } as const;
/** 새 게임 부트스트랩 데이터(starterHorses.test.ts 와 같다) */
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

/** M4-ST1 적용 전(HEAD) 시드 20261011 의 AI 소유 말 JSON 해시. 다른 티켓이 AI 세계를 의도적으로 바꾸면 갱신한다. */
// 2026-10-15 재고정: 5대 혈통 15회차 데이터·어휘 정리(종마 데이터가 바뀌면 AI 말도 바뀐다 — ST1 적용 전후 동일은 ST1 커밋에서 확인)
// 2026-10-16 재고정: M4-ST2 지급마 가상 모마 3두가 소유 없는 말(ownerId null)로 추가돼 이 필터에 들어간다. 기존 AI 말 개별 해시는 전부 불변 확인.
// 2026-10-16 재고정: 5대 혈통 16·17회차 데이터·어휘 정리
const AI_WORLD_HASH_AT_M4_ST1 = '668bcc1916808fefeedfa1cd04e61c401fe14e0446674a95124d07d0d92b5725';

function boot(seed: number): GameState {
  return bootstrapGame({ seed, playerName: 'Test Owner', silks: { ...SILKS } }, BOOT_DATA);
}

/** 플레이어 소유 지급 말(in_training), ID 오름차순 */
function starters(state: GameState): Horse[] {
  return Object.values(state.horses)
    .filter((h) => h.ownerId === state.playerOwnerId && h.status === 'in_training')
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return NaN;
  return n % 2 === 1 ? (s[(n - 1) / 2] as number) : ((s[n / 2 - 1] as number) + (s[n / 2] as number)) / 2;
}

interface Sample {
  seed: number;
  age: number;
  officialRating: number | null;
  potentialRating: number;
}

let SAMPLES: Sample[] = [];

beforeAll(() => {
  const out: Sample[] = [];
  for (const seed of SEEDS) {
    const state = boot(seed);
    for (const h of starters(state)) {
      out.push({
        seed,
        age: state.date.year - h.birthYear,
        officialRating: h.officialRating,
        potentialRating: ratingFromAbility(meanAbility(h.potential)),
      });
    }
  }
  SAMPLES = out;
}, MID_TIMEOUT);

describe('M4-ST1 새 게임 지급마 능력', () => {
  it('1. 3세 지급마 시작 OR 중앙값이 98~106, 최솟값이 92 이상이다(시드 1~40)', () => {
    const threeYo = SAMPLES.filter((s) => s.age === 3);
    expect(threeYo).toHaveLength(SEEDS.length);
    const ors = threeYo.map((s) => s.officialRating ?? NaN);
    // 지급마 성장형 고정(STARTER_GROWTH_TYPE, 2026-10-15 Opus)으로 최솟값 기준도 만족한다
    expect(Math.min(...ors)).toBeGreaterThanOrEqual(92);
    const m = median(ors);
    expect(m).toBeGreaterThanOrEqual(98);
    expect(m).toBeLessThanOrEqual(106);
  }, MID_TIMEOUT);

  it('2. 2세 지급마 잠재 레이팅 중앙값이 100~110, 최솟값이 92 이상이다(시드 1~40)', () => {
    const twoYo = SAMPLES.filter((s) => s.age === 2);
    expect(twoYo).toHaveLength(SEEDS.length * 2);
    const pots = twoYo.map((s) => s.potentialRating);
    const m = median(pots);
    expect(m).toBeGreaterThanOrEqual(100);
    expect(m).toBeLessThanOrEqual(110);
    expect(Math.min(...pots)).toBeGreaterThanOrEqual(92);
  }, MID_TIMEOUT);

  it('3. 지급마 외 세계(AI 소유 말)는 M4-ST1 적용 전과 같다', () => {
    const state = boot(SEED);
    const ai = Object.values(state.horses)
      .filter((h) => h.ownerId !== state.playerOwnerId)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const hash = createHash('sha256').update(JSON.stringify(ai)).digest('hex');
    expect(hash).toBe(AI_WORLD_HASH_AT_M4_ST1);
  }, MID_TIMEOUT);

  it('4. 같은 시드면 지급마 능력·OR 이 같다', () => {
    const a = starters(boot(SEED));
    const b = starters(boot(SEED));
    expect(b.map((h) => h.ability)).toEqual(a.map((h) => h.ability));
    expect(b.map((h) => h.potential)).toEqual(a.map((h) => h.potential));
    expect(b.map((h) => h.officialRating)).toEqual(a.map((h) => h.officialRating));
  }, MID_TIMEOUT);
});
