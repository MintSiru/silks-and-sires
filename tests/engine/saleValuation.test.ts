import { beforeAll, describe, expect, it } from 'vitest';
import { START_YEAR } from '../../src/engine/config/game';
import {
  SALE_QUALITY_SD,
  SALE_RANGE_HIGH,
  SALE_RANGE_LOW,
  SALE_TREND_MAX,
  SALE_TREND_MIN,
  SALE_VALUE_FLOOR,
} from '../../src/engine/config/sales';
import { getNamingData, getNicks, getPeopleData, getRaceTemplates, getRacecourses, getSeriesDefinitions, getStallionNames, getStallionRecords } from '../../src/engine/data/staticData';
import { createRng } from '../../src/engine/rng';
import { bootstrapGame, type BootstrapData } from '../../src/engine/state/bootstrap';
import { estimateRange, marketGrade, marketTrend, valueLot } from '../../src/engine/sales/valuation';
import { isRacingHorse, ageOf } from '../../src/engine/world/population';
import type { GameState, Horse, Mare, Rng, SaleKind, SaleSummary, Stallion } from '../../src/engine/types';

const SEED = 20261011;
const YEAR = START_YEAR;
const SILKS = { primary: '#1d4e89', secondary: '#ffd23f', pattern: 'hoops' } as const;
const MID_TIMEOUT = 180_000;
const BASE_MEDIAN_YEARLING = 40_000;

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

let BASE: GameState;

beforeAll(() => {
  BASE = bootstrapGame({ seed: SEED, playerName: 'Test Owner', silks: { ...SILKS } }, BOOT_DATA);
}, MID_TIMEOUT);

/** 노이즈를 0 으로 고정한 rng(정규 난수 = 0) */
function zeroNoiseRng(): Rng {
  return { ...createRng(1), normal: () => 0 };
}

/** normal 호출 횟수를 세는 rng */
function countingRng(seed: number): { rng: Rng; normalCalls: () => number } {
  const base = createRng(seed);
  let calls = 0;
  const rng: Rng = {
    ...base,
    normal: (mean?: number, sd?: number) => {
      calls++;
      return base.normal(mean, sd);
    },
  };
  return { rng, normalCalls: () => calls };
}

/** 깊은 복제 후 변형한 상태(원본 BASE 는 건드리지 않는다) */
function variant(mutate: (s: GameState) => void): GameState {
  const copy = structuredClone(BASE);
  mutate(copy);
  return copy;
}

/** 부 종마 레코드가 있는 AI 현역마 한 마리(ID 순) */
function sampleHorse(state: GameState): Horse {
  const horse = Object.keys(state.horses)
    .sort()
    .map((id) => state.horses[id])
    .find((h): h is Horse => h !== undefined && isRacingHorse(state, h) && h.sireId !== null && state.stallions[h.sireId] !== undefined);
  if (!horse) throw new Error('샘플 말 없음');
  return horse;
}

function summary(kind: SaleKind, year: number, median: number): SaleSummary {
  return { saleId: `test-${kind}-${year}`, year, kind, offered: 10, sold: 8, turnover: median * 8, median, top: null };
}

const KINDS: readonly SaleKind[] = ['yearling', 'foal', 'breeze_up', 'horses_in_training', 'breeding_stock'];

describe('세일 가치 평가 (valueLot / estimateRange / marketTrend)', () => {
  describe('1. 결정성과 rng 사용 규칙', () => {
    it('같은 입력·같은 rng 상태이면 같은 값이 나온다', () => {
      const horse = sampleHorse(BASE);
      for (const kind of KINDS) {
        const a = valueLot(BASE, horse, kind, YEAR, createRng(SEED).fork(horse.id));
        const b = valueLot(BASE, horse, kind, YEAR, createRng(SEED).fork(horse.id));
        expect(a).toBe(b);
      }
    });

    it('종류와 상관없이 rng.normal 을 정확히 1회 쓴다', () => {
      const horse = sampleHorse(BASE);
      for (const kind of KINDS) {
        const { rng, normalCalls } = countingRng(SEED);
        valueLot(BASE, horse, kind, YEAR, rng);
        expect(normalCalls(), kind).toBe(1);
      }
    });

    it('결과는 정수이고 100 단위이며 하한 이상이다', () => {
      const horses = Object.keys(BASE.horses)
        .sort()
        .map((id) => BASE.horses[id])
        .filter((h): h is Horse => h !== undefined && isRacingHorse(BASE, h))
        .slice(0, 40);
      for (const horse of horses) {
        for (const kind of KINDS) {
          const v = valueLot(BASE, horse, kind, YEAR, createRng(SEED).fork(horse.id));
          expect(Number.isInteger(v)).toBe(true);
          expect(v % 100).toBe(0);
          expect(v).toBeGreaterThanOrEqual(SALE_VALUE_FLOOR);
        }
      }
    });

    it('하한 1,000: 능력이 매우 낮고 부 종부료가 낮은 1세마는 1,000 € 로 올림된다', () => {
      const state = variant((s) => {
        const horse = sampleHorse(s);
        if (horse.sireId) s.stallions[horse.sireId]!.fee = 100;
        horse.potential = { speed: 5, stamina: 5, acceleration: 5, guts: 5, power: 5 };
        horse.soundness = 10;
      });
      const horse = sampleHorse(state);
      expect(valueLot(state, horse, 'yearling', YEAR, zeroNoiseRng())).toBe(SALE_VALUE_FLOOR);
    });
  });

  describe('2. 단조성 (노이즈 0 고정)', () => {
    it('부 종부료가 크면 1세마 값이 크다', () => {
      const values = [6_000, 30_000, 60_000, 150_000].map((fee) => {
        const state = variant((s) => {
          const horse = sampleHorse(s);
          s.stallions[horse.sireId!]!.fee = fee;
        });
        return valueLot(state, sampleHorse(state), 'yearling', YEAR, zeroNoiseRng());
      });
      for (let i = 1; i < values.length; i++) {
        expect(values[i]!).toBeGreaterThan(values[i - 1]!);
      }
    });

    it('인기 80 > 50 > 20 순서로 값이 커진다', () => {
      const valueAt = (popularity: number) => {
        const state = variant((s) => {
          const horse = sampleHorse(s);
          s.stallions[horse.sireId!]!.popularity = popularity;
        });
        return valueLot(state, sampleHorse(state), 'yearling', YEAR, zeroNoiseRng());
      };
      const v80 = valueAt(80);
      const v50 = valueAt(50);
      const v20 = valueAt(20);
      expect(v80).toBeGreaterThan(v50);
      expect(v50).toBeGreaterThan(v20);
    });

    it('soundness 30 은 soundness 40 보다 × 0.6 이다(반올림 오차 범위)', () => {
      const valueAt = (soundness: number) => {
        const state = variant((s) => {
          const horse = sampleHorse(s);
          horse.soundness = soundness;
        });
        return valueLot(state, sampleHorse(state), 'yearling', YEAR, zeroNoiseRng());
      };
      const ratio = valueAt(30) / valueAt(40);
      expect(ratio).toBeCloseTo(0.6, 2);
    });

    it('현역마: OR 95 > OR 75', () => {
      const valueAt = (or: number) => {
        const state = variant((s) => {
          const horse = sampleHorse(s);
          horse.officialRating = or;
          horse.birthYear = YEAR - 4;
        });
        return valueLot(state, sampleHorse(state), 'horses_in_training', YEAR, zeroNoiseRng());
      };
      expect(valueAt(95)).toBeGreaterThan(valueAt(75));
    });

    it('현역마: 나이 4세 > 6세 (같은 OR)', () => {
      const valueAt = (age: number) => {
        const state = variant((s) => {
          const horse = sampleHorse(s);
          horse.officialRating = 85;
          horse.birthYear = YEAR - age;
        });
        return valueLot(state, sampleHorse(state), 'horses_in_training', YEAR, zeroNoiseRng());
      };
      expect(valueAt(4)).toBeGreaterThan(valueAt(6));
    });

    it('번식 암말: 임신 > 비임신', () => {
      const valueAt = (pregnant: boolean) => {
        const state = variant((s) => {
          const horse = sampleHorse(s);
          const sireId = horse.sireId!;
          const coverer = Object.values(s.stallions).find((st) => st.horseId !== sireId) as Stallion;
          coverer.fee = 60_000;
          const mare: Mare = {
            horseId: horse.id,
            coveredBy: coverer.horseId,
            coveredWeek: null,
            pregnant,
            dueWeek: pregnant ? YEAR * 100 + 7 : null,
            foals: [],
            blackTypeProduce: 0,
          };
          s.mares[horse.id] = mare;
          horse.birthYear = YEAR - 5;
        });
        return valueLot(state, sampleHorse(state), 'breeding_stock', YEAR, zeroNoiseRng());
      };
      expect(valueAt(true)).toBeGreaterThan(valueAt(false));
    });

    it('부 성적: 승률 0.3 미만(출주 20두 이상)이면 감점된다', () => {
      const valueAt = (winners: number) => {
        const state = variant((s) => {
          const horse = sampleHorse(s);
          s.sireStats[horse.sireId!] = {
            starters: 25,
            winners,
            runs: 60,
            wins: winners,
            groupWins: 0,
            groupWinners: 0,
            earnings: 0,
            winDistanceSum: 0,
          };
        });
        return valueLot(state, sampleHorse(state), 'yearling', YEAR, zeroNoiseRng());
      };
      expect(valueAt(10)).toBeGreaterThan(valueAt(5));
    });
  });

  describe('3. 시세 marketTrend', () => {
    it('기록이 없으면 1', () => {
      expect(marketTrend(BASE, 'yearling', YEAR)).toBe(1);
    });

    it('같은 종류가 아니거나 기간(year−2 ~ year−1) 밖이면 무시한다', () => {
      const state = variant((s) => {
        s.sales.history = [
          summary('foal', YEAR - 1, BASE_MEDIAN_YEARLING * 2),
          summary('yearling', YEAR, BASE_MEDIAN_YEARLING * 2),
          summary('yearling', YEAR - 3, BASE_MEDIAN_YEARLING * 2),
        ];
      });
      expect(marketTrend(state, 'yearling', YEAR)).toBe(1);
    });

    it('중앙값이 기준의 2배면 상한 SALE_TREND_MAX 로 자른다', () => {
      const state = variant((s) => {
        s.sales.history = [
          summary('yearling', YEAR - 2, BASE_MEDIAN_YEARLING * 2),
          summary('yearling', YEAR - 1, BASE_MEDIAN_YEARLING * 2),
        ];
      });
      expect(marketTrend(state, 'yearling', YEAR)).toBe(SALE_TREND_MAX);
    });

    it('중앙값이 기준의 0.5배면 하한 SALE_TREND_MIN 으로 자른다', () => {
      const state = variant((s) => {
        s.sales.history = [summary('yearling', YEAR - 1, BASE_MEDIAN_YEARLING * 0.5)];
      });
      expect(marketTrend(state, 'yearling', YEAR)).toBe(SALE_TREND_MIN);
    });

    it('두 해의 중앙값 평균 기준으로 계산한다(1.0 과 1.1 → 1.05)', () => {
      const state = variant((s) => {
        s.sales.history = [
          summary('yearling', YEAR - 2, BASE_MEDIAN_YEARLING * 1.0),
          summary('yearling', YEAR - 1, BASE_MEDIAN_YEARLING * 1.1),
        ];
      });
      expect(marketTrend(state, 'yearling', YEAR)).toBeCloseTo(1.05, 10);
    });

    it('낙찰이 없었던 해(중앙값 0)는 기록에서 뺀다', () => {
      const state = variant((s) => {
        s.sales.history = [summary('yearling', YEAR - 2, 0), summary('yearling', YEAR - 1, BASE_MEDIAN_YEARLING * 1.1)];
      });
      expect(marketTrend(state, 'yearling', YEAR)).toBeCloseTo(1.1, 10);
    });

    it('시세 배율은 valueLot 에 곱해진다(상한 2배 기록이면 값이 1.15 배)', () => {
      const horse = sampleHorse(BASE);
      const plain = valueLot(BASE, horse, 'yearling', YEAR, zeroNoiseRng());
      const hot = variant((s) => {
        s.sales.history = [
          summary('yearling', YEAR - 2, BASE_MEDIAN_YEARLING * 2),
          summary('yearling', YEAR - 1, BASE_MEDIAN_YEARLING * 2),
        ];
      });
      const boosted = valueLot(hot, sampleHorse(hot), 'yearling', YEAR, zeroNoiseRng());
      expect(boosted / plain).toBeCloseTo(SALE_TREND_MAX, 2);
    });
  });

  describe('4. 추정 범위 estimateRange', () => {
    it('low = 0.7 배, high = 1.4 배, 100 단위 반올림', () => {
      expect(estimateRange(100_000)).toEqual({ low: 70_000, high: 140_000 });
      expect(estimateRange(12_345)).toEqual({ low: 8_600, high: 17_300 });
    });

    it('상수 SALE_RANGE_LOW·SALE_RANGE_HIGH 와 일치한다', () => {
      const v = 50_000;
      const r = estimateRange(v);
      expect(r.low).toBe(Math.round((v * SALE_RANGE_LOW) / 100) * 100);
      expect(r.high).toBe(Math.round((v * SALE_RANGE_HIGH) / 100) * 100);
    });
  });

  describe('5. 등급과 분포 회귀(시드 20261011, 2세 현역마를 1세마로 평가)', () => {
    it('부 등급 1·3·5 의 중앙값이 목표 구간 안이다', () => {
      const byGrade: Record<number, number[]> = {};
      const horses = Object.keys(BASE.horses)
        .sort()
        .map((id) => BASE.horses[id])
        .filter((h): h is Horse => h !== undefined && isRacingHorse(BASE, h) && ageOf(h, YEAR) === 2);
      for (const horse of horses) {
        const fee = horse.sireId && BASE.stallions[horse.sireId] ? BASE.stallions[horse.sireId]!.fee : 5_000;
        const grade = marketGrade(fee);
        const v = valueLot(BASE, horse, 'yearling', YEAR, createRng(SEED).fork(horse.id));
        (byGrade[grade] ??= []).push(v);
      }
      const median = (xs: number[]) => {
        const s = [...xs].sort((a, b) => a - b);
        const m = Math.floor(s.length / 2);
        return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
      };
      expect(median(byGrade[1]!)).toBeGreaterThanOrEqual(200_000);
      expect(median(byGrade[1]!)).toBeLessThanOrEqual(400_000);
      expect(median(byGrade[3]!)).toBeGreaterThanOrEqual(40_000);
      expect(median(byGrade[3]!)).toBeLessThanOrEqual(80_000);
      expect(median(byGrade[5]!)).toBeGreaterThanOrEqual(8_000);
      expect(median(byGrade[5]!)).toBeLessThanOrEqual(16_000);
    }, MID_TIMEOUT);

    it('SALE_QUALITY_SD 는 측정값(양수)이다', () => {
      expect(SALE_QUALITY_SD).toBeGreaterThan(0);
    });
  });
});
