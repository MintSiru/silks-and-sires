import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/engine/rng';
import { assessHorse, gradeOf } from '../../src/engine/horse/assessment';
import {
  DISTANCE_HINT_MAX,
  DISTANCE_HINT_MIN,
  DISTANCE_HINT_ROUND,
} from '../../src/engine/config/assessment';
import {
  COMMENT_KEYS,
  GRADE_ORDER,
  type AssessmentStage,
  type Grade,
  type GrowthProfile,
  type Horse,
} from '../../src/engine/types';

interface HorseSpec {
  id?: string;
  ability?: number;
  potential?: number;
  soundness?: number;
  mental?: number;
  distanceOptimum?: number;
  goingPreference?: number;
  growthType?: GrowthProfile['type'];
  abilityOverride?: Partial<Horse['ability']>;
  potentialOverride?: Partial<Horse['potential']>;
}

/** 테스트 전용 Horse 생성기. 다른 티켓의 생성기에 의존하지 않는다. */
function makeHorse(spec: HorseSpec = {}): Horse {
  const ability = spec.ability ?? 60;
  const potential = spec.potential ?? 60;
  return {
    id: spec.id ?? 'test-horse',
    name: 'Test Horse',
    sex: 'male',
    gelded: false,
    birthYear: 2026,
    countryOfBirth: 'GB',
    status: 'foal',
    sireId: null,
    sireLineId: null,
    damId: null,
    ownerId: null,
    breederId: null,
    trainerId: null,
    ability: {
      speed: ability, stamina: ability, acceleration: ability, guts: ability, power: ability,
      ...spec.abilityOverride,
    },
    potential: {
      speed: potential, stamina: potential, acceleration: potential, guts: potential, power: potential,
      ...spec.potentialOverride,
    },
    growth: { type: spec.growthType ?? 'normal', peakAge: 4, declineRate: 0.2 },
    aptitude: {
      distanceOptimum: spec.distanceOptimum ?? 1600,
      distanceRange: 400,
      goingPreference: spec.goingPreference ?? 2.5,
      goingTolerance: 2,
      allWeather: 0,
      dirt: 0,
      leftHanded: 0,
      rightHanded: 0,
      undulation: 0,
    },
    preferredStyle: 'prominent',
    condition: { fitness: 50, fatigue: 0, mental: spec.mental ?? 60, injury: null },
    officialRating: null,
    familyId: null,
    soundness: spec.soundness ?? 60,
    record: { starts: 0, wins: 0, seconds: 0, thirds: 0, earnings: 0, blackTypePlacings: 0, groupWins: 0 },
  };
}

const DATE = { year: 2026, week: 10 };
const STAGES: readonly AssessmentStage[] = ['foal', 'yearling', 'two_year_old', 'in_training'];

function gradeIndex(g: Grade): number {
  return GRADE_ORDER.indexOf(g);
}

describe('수용 기준 1: gradeOf 경계', () => {
  it('85→S, 84.9→A, 45→D, 44.9→E 이고 나머지 경계도 맞다', () => {
    expect(gradeOf(85)).toBe('S');
    expect(gradeOf(84.9)).toBe('A');
    expect(gradeOf(75)).toBe('A');
    expect(gradeOf(74.9)).toBe('B');
    expect(gradeOf(65)).toBe('B');
    expect(gradeOf(64.9)).toBe('C');
    expect(gradeOf(55)).toBe('C');
    expect(gradeOf(54.9)).toBe('D');
    expect(gradeOf(45)).toBe('D');
    expect(gradeOf(44.9)).toBe('E');
  });
});

describe('수용 기준 2: 같은 시드 = 같은 Assessment', () => {
  it('같은 입력·같은 시드면 결과가 완전히 같다', () => {
    const horse = makeHorse({ potential: 70, ability: 65 });
    for (const stage of STAGES) {
      const a = assessHorse(horse, stage, 50, DATE, createRng('same-seed'));
      const b = assessHorse(horse, stage, 50, DATE, createRng('same-seed'));
      expect(a).toEqual(b);
    }
  });

  it('다른 시드에서는 등급이 흔들릴 수 있다(한 시드만 보면 항상 같은 등급이 나오지 않는다)', () => {
    const horse = makeHorse({ potential: 70 });
    const seen = new Set<Grade>();
    for (let s = 0; s < 200; s++) {
      seen.add(assessHorse(horse, 'foal', 0, DATE, createRng(`vary-${s}`)).conformation.overall);
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('수용 기준 3: 정확도', () => {
  function evaluateMany(horse: Horse, stage: AssessmentStage, skill: number, n: number, seed: string) {
    const rng = createRng(seed);
    const out: Grade[] = [];
    for (let i = 0; i < n; i++) {
      out.push(assessHorse(horse, stage, skill, DATE, rng).conformation.overall);
    }
    return out;
  }
  function mean(values: number[]): number {
    return values.reduce((s, v) => s + v, 0) / values.length;
  }
  function saShare(grades: Grade[]): number {
    return grades.filter((g) => g === 'S' || g === 'A').length / grades.length;
  }

  it('foal 단계에서도 potential 80 말의 평균 등급 순위가 40 말보다 좋다', () => {
    const high = makeHorse({ potential: 80, ability: 80 });
    const low = makeHorse({ potential: 40, ability: 40 });
    const highMean = mean(evaluateMany(high, 'foal', 0, 500, 'acc-high').map(gradeIndex));
    const lowMean = mean(evaluateMany(low, 'foal', 0, 500, 'acc-low').map(gradeIndex));
    expect(highMean).toBeLessThan(lowMean);
  });

  it('in_training·skill 100 에서 80 말의 overall 이 S/A 인 비율은 90% 이상이다', () => {
    const horse = makeHorse({ potential: 80, ability: 80 });
    const share = saShare(evaluateMany(horse, 'in_training', 100, 500, 'acc-train-100'));
    expect(share).toBeGreaterThanOrEqual(0.9);
  });

  it('foal·skill 0 에서는 80 말의 S/A 비율이 in_training 보다 낮다', () => {
    const horse = makeHorse({ potential: 80, ability: 80 });
    const foalShare = saShare(evaluateMany(horse, 'foal', 0, 500, 'acc-foal-0'));
    const trainShare = saShare(evaluateMany(horse, 'in_training', 100, 500, 'acc-train-100b'));
    expect(foalShare).toBeLessThan(trainShare);
  });
});

describe('수용 기준 4: 인식 오차는 조교 중이 더 작다', () => {
  it('같은 말 2,000회 평가 시 in_training 의 overall 등급 분산 < foal 의 분산', () => {
    const horse = makeHorse({ potential: 60, ability: 60 });
    const variance = (stage: AssessmentStage, seed: string): number => {
      const rng = createRng(seed);
      const values: number[] = [];
      for (let i = 0; i < 2000; i++) {
        values.push(gradeIndex(assessHorse(horse, stage, 0, DATE, rng).conformation.overall));
      }
      const m = values.reduce((s, v) => s + v, 0) / values.length;
      return values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length;
    };
    expect(variance('in_training', 'var-train')).toBeLessThan(variance('foal', 'var-foal'));
  });
});

describe('수용 기준 5: 코멘트', () => {
  it('코멘트 수는 1~3, 첫 번째는 overall_* 키, 모든 키는 COMMENT_KEYS 안, 중복 없음', () => {
    for (let s = 0; s < 300; s++) {
      const horse = makeHorse({
        potential: 30 + (s % 7) * 10,
        ability: 30 + (s % 5) * 12,
        soundness: 20 + (s % 6) * 14,
        mental: 20 + (s % 4) * 20,
        goingPreference: (s % 6) * 1.2,
        growthType: s % 3 === 0 ? 'precocious' : s % 3 === 1 ? 'late' : 'normal',
      });
      for (const stage of STAGES) {
        const { comments } = assessHorse(horse, stage, 60, DATE, createRng(`cm-${s}-${stage}`));
        expect(comments.length).toBeGreaterThanOrEqual(1);
        expect(comments.length).toBeLessThanOrEqual(3);
        expect(comments[0]?.key.startsWith('overall_')).toBe(true);
        const keys = comments.map((c) => c.key);
        expect(new Set(keys).size).toBe(keys.length);
        for (const c of comments) {
          expect((COMMENT_KEYS as readonly string[]).includes(c.key)).toBe(true);
        }
      }
    }
  });

  it('종합 코멘트: 아주 높은 말은 overall_star(positive), 아주 낮은 말은 overall_limited(negative)', () => {
    const top = assessHorse(makeHorse({ potential: 95, ability: 95 }), 'in_training', 100, DATE, createRng('top'));
    expect(top.comments[0]).toEqual({ key: 'overall_star', tone: 'positive' });
    const bottom = assessHorse(makeHorse({ potential: 20, ability: 20 }), 'in_training', 100, DATE, createRng('bottom'));
    expect(bottom.comments[0]).toEqual({ key: 'overall_limited', tone: 'negative' });
  });

  it('특징 코멘트: 스피드가 매우 높은 말은 speed_exceptional 이 특징 코멘트 첫 자리에 온다', () => {
    const horse = makeHorse({
      potential: 60,
      ability: 60,
      abilityOverride: { speed: 95 },
      potentialOverride: { speed: 95 },
    });
    const { comments } = assessHorse(horse, 'in_training', 100, DATE, createRng('speed-x'));
    expect(comments[1]?.key).toBe('speed_exceptional');
    expect(comments[1]?.tone).toBe('positive');
  });

  it('특징 코멘트는 최대 2개(종합 제외 시 MAX_COMMENTS-1)로 제한된다', () => {
    const horse = makeHorse({
      potential: 60,
      ability: 60,
      soundness: 10,
      mental: 10,
      abilityOverride: { speed: 95, stamina: 15, acceleration: 15, guts: 95, power: 15 },
      potentialOverride: { speed: 95, stamina: 15, acceleration: 15, guts: 95, power: 15 },
    });
    const { comments } = assessHorse(horse, 'in_training', 100, DATE, createRng('many'));
    expect(comments.length).toBe(3);
  });

  it('마장 코멘트는 2살 이후 단계에서만 나오고, foal 에서는 나오지 않는다', () => {
    const horse = makeHorse({ potential: 60, ability: 60, goingPreference: 1.0 });
    for (let s = 0; s < 100; s++) {
      const foal = assessHorse(horse, 'foal', 0, DATE, createRng(`fg-${s}`));
      expect(foal.comments.some((c) => c.key === 'going_likes_fast')).toBe(false);
    }
    let fastCount = 0;
    for (let s = 0; s < 200; s++) {
      const r = assessHorse(horse, 'two_year_old', 100, DATE, createRng(`tg-${s}`));
      if (r.comments.some((c) => c.key === 'going_likes_fast')) fastCount++;
    }
    expect(fastCount).toBeGreaterThan(150);
  });
});

describe('수용 기준 6: 거리 힌트', () => {
  it('모든 단계에서 [1000, 3600] 안, 100 단위, min ≤ max', () => {
    const horses = [
      makeHorse({ distanceOptimum: 1000 }),
      makeHorse({ distanceOptimum: 2000 }),
      makeHorse({ distanceOptimum: 3600 }),
    ];
    for (const horse of horses) {
      for (const stage of STAGES) {
        for (let s = 0; s < 100; s++) {
          const { min, max } = assessHorse(horse, stage, 50, DATE, createRng(`dist-${s}`)).distanceHint;
          expect(min).toBeGreaterThanOrEqual(DISTANCE_HINT_MIN);
          expect(max).toBeLessThanOrEqual(DISTANCE_HINT_MAX);
          expect(min % DISTANCE_HINT_ROUND).toBe(0);
          expect(max % DISTANCE_HINT_ROUND).toBe(0);
          expect(min).toBeLessThanOrEqual(max);
        }
      }
    }
  });

  it('foal 힌트 폭은 in_training 힌트 폭 이상이다(평균 기준)', () => {
    // 범위 밖 클램프 때문에 가장자리 말은 시드별로 역전될 수 있다(명세 순서상 정상). 평균으로 검증한다.
    const horse = makeHorse({ distanceOptimum: 1600 });
    let foalSum = 0;
    let trainSum = 0;
    for (let s = 0; s < 300; s++) {
      const foal = assessHorse(horse, 'foal', 50, DATE, createRng(`w-${s}`)).distanceHint;
      const train = assessHorse(horse, 'in_training', 50, DATE, createRng(`w-${s}`)).distanceHint;
      foalSum += foal.max - foal.min;
      trainSum += train.max - train.min;
    }
    expect(foalSum / 300).toBeGreaterThanOrEqual(trainSum / 300);
  });
});

describe('수용 기준 7: 숨은 숫자 능력치가 노출되지 않는다', () => {
  it('Assessment 와 하위 객체에 정해진 키만 있다', () => {
    const horse = makeHorse({ potential: 70 });
    const a = assessHorse(horse, 'two_year_old', 50, DATE, createRng('shape'));
    expect(Object.keys(a).sort()).toEqual(
      ['comments', 'conformation', 'distanceHint', 'growthHint', 'horseId', 'week', 'year'],
    );
    expect(Object.keys(a.conformation).sort()).toEqual(
      ['action', 'frame', 'hindquarters', 'legs', 'overall', 'stage', 'temperament'],
    );
    expect(Object.keys(a.distanceHint).sort()).toEqual(['max', 'min']);
    for (const c of a.comments) {
      expect(Object.keys(c).sort()).toEqual(['key', 'tone']);
    }
  });
});

describe('성장형 힌트', () => {
  it('foal 은 항상 unknown 이다', () => {
    const horse = makeHorse({ growthType: 'precocious' });
    for (let s = 0; s < 100; s++) {
      expect(assessHorse(horse, 'foal', 100, DATE, createRng(`g-${s}`)).growthHint).toBe('unknown');
    }
  });

  it('in_training 힌트는 진짜 성장형 또는 unknown 이고, 대부분 맞는 값이다', () => {
    const horse = makeHorse({ growthType: 'late' });
    let correct = 0;
    for (let s = 0; s < 300; s++) {
      const hint = assessHorse(horse, 'in_training', 50, DATE, createRng(`gh-${s}`)).growthHint;
      expect(['late', 'unknown']).toContain(hint);
      if (hint === 'late') correct++;
    }
    expect(correct / 300).toBeGreaterThan(0.8);
  });
});

describe('기록 필드', () => {
  it('year/week 는 date 에서 온다', () => {
    const a = assessHorse(makeHorse(), 'yearling', 0, { year: 2028, week: 33 }, createRng('date'));
    expect(a.year).toBe(2028);
    expect(a.week).toBe(33);
    expect(a.horseId).toBe('test-horse');
  });
});
