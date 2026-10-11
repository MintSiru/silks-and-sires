import type { Abilities, GrowthProfile, Rng } from '../types';
import {
  ABILITY_MAX,
  ABILITY_MIN,
  GROWTH_CURVE_EXP,
  GROWTH_DECLINE_RATE,
  GROWTH_PEAK_AGE,
  GROWTH_TYPE_WEIGHTS,
  MATURITY_AT_BIRTH,
  MATURITY_FLOOR,
  MATURITY_PLATEAU_YEARS,
} from '../config/horse';

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** ageYears(실수, 0 = 출생) 에서의 성숙도 0~1 */
export function maturity(ageYears: number, growth: GrowthProfile): number {
  if (ageYears <= 0) return MATURITY_AT_BIRTH;
  const peak = growth.peakAge;
  if (ageYears <= peak) {
    const t = ageYears / peak;
    return MATURITY_AT_BIRTH + (1 - MATURITY_AT_BIRTH) * Math.pow(t, GROWTH_CURVE_EXP[growth.type]);
  }
  if (ageYears <= peak + MATURITY_PLATEAU_YEARS) return 1;
  return Math.max(MATURITY_FLOOR, 1 - growth.declineRate * (ageYears - peak - MATURITY_PLATEAU_YEARS));
}

/** GROWTH_TYPE_WEIGHTS 누적 가중치로 성장형을 고른다. rng.next() 를 정확히 1회 쓴다. */
export function sampleGrowthProfile(rng: Rng): GrowthProfile {
  const u = rng.next();
  const types = Object.keys(GROWTH_TYPE_WEIGHTS) as GrowthProfile['type'][];
  let cumulative = 0;
  let chosen: GrowthProfile['type'] = types[types.length - 1] as GrowthProfile['type'];
  for (const type of types) {
    cumulative += GROWTH_TYPE_WEIGHTS[type];
    if (u < cumulative) {
      chosen = type;
      break;
    }
  }
  return {
    type: chosen,
    peakAge: GROWTH_PEAK_AGE[chosen],
    declineRate: GROWTH_DECLINE_RATE[chosen],
  };
}

/** 각 능력 = potential × maturity, [ABILITY_MIN, ABILITY_MAX] */
export function abilityAtAge(potential: Abilities, ageYears: number, growth: GrowthProfile): Abilities {
  const m = maturity(ageYears, growth);
  const scale = (v: number): number => clamp(v * m, ABILITY_MIN, ABILITY_MAX);
  return {
    speed: scale(potential.speed),
    stamina: scale(potential.stamina),
    acceleration: scale(potential.acceleration),
    guts: scale(potential.guts),
    power: scale(potential.power),
  };
}
