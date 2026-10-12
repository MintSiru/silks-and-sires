import { NAME_MAX_ATTEMPTS } from '../config/people';
import type { Rng } from '../types';

/** 이름 풀이 있는 국가 키(data/people/name_pools.json). BR·ZA 는 CountryCode 가 아니므로 이 타입을 쓴다. */
export const NAME_COUNTRIES = ['GB', 'IE', 'FR', 'DE', 'IT', 'US', 'AU', 'JP', 'BR', 'ZA', 'AE'] as const;
export type NameCountry = (typeof NAME_COUNTRIES)[number];

export type PersonSex = 'male' | 'female';

/** 국가 하나의 이름 풀 */
export interface CountryNamePool {
  givenMale: readonly string[];
  givenFemale: readonly string[];
  surnames: readonly string[];
}

export type NamePools = Record<NameCountry, CountryNamePool>;

export function isNameCountry(value: string): value is NameCountry {
  return (NAME_COUNTRIES as readonly string[]).includes(value);
}

/** 비교용 정규화: 앞뒤 공백 제거, 연속 공백 한 칸, 소문자. */
export function normalizeFullName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * given + surname 을 뽑는다. 정규화한 결과가 used 에 있거나 blocked 에 있으면 다시 뽑고,
 * 성공하면 used 에 정규화 키를 추가한다(호출자 집합을 변형함).
 * blocked 는 normalizeFullName 으로 정규화된 항목이어야 한다.
 * 최대 NAME_MAX_ATTEMPTS 회 실패하면 Error.
 */
export function generatePersonName(
  rng: Rng,
  pools: NamePools,
  country: NameCountry,
  sex: PersonSex,
  used: Set<string>,
  blocked: ReadonlySet<string>,
): string {
  const pool = pools[country];
  for (let attempt = 0; attempt < NAME_MAX_ATTEMPTS; attempt++) {
    const given = rng.pick(sex === 'male' ? pool.givenMale : pool.givenFemale);
    const surname = rng.pick(pool.surnames);
    const full = `${given} ${surname}`;
    const key = normalizeFullName(full);
    if (used.has(key) || blocked.has(key)) continue;
    used.add(key);
    return full;
  }
  throw new Error(`generatePersonName: ${country} ${sex} 이름을 ${NAME_MAX_ATTEMPTS}회 안에 뽑지 못했다`);
}
