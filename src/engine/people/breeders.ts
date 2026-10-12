/**
 * 상업 생산자(M4-C0) 생성과 현역마 생산자 배정.
 * 생산자는 경주에 출주하지 않고 생산·판매만 하는 가상 목장이다. 말의 생산자는 오너브리더(목장 있는 마주가
 * 직접 생산)이거나 같은 나라 상업 생산자다. 생산자 배정 난수는 집단 rng 가 아니라 말마다 독립 스트림을 쓴다.
 */
import {
  BREEDER_COUNT_BY_COUNTRY,
  BREEDER_FUNDS_RANGE,
  BREEDER_ID_DIGITS,
  BREEDER_ID_PREFIX,
  BREEDER_NAME_MAX_ATTEMPTS,
  BREEDER_PICK_WEIGHT,
  BREEDER_SCALE_ORDER,
  BREEDER_SCALE_SHARE,
  OWNER_BREEDER_SHARE,
} from '../config/breeders';
import { POPULATION_COUNTRY_ORDER } from '../config/population';
import { createRng } from '../rng';
import type {
  BreederId,
  BreederScale,
  CommercialBreeder,
  GameState,
  Horse,
  Owner,
  OwnerId,
  Rng,
} from '../types';
import { createPeopleContext, makeStudName, type PeopleContext, type PeopleStaticData } from './generate';
import { isNameCountry, normalizeFullName, type NameCountry } from './names';

function formatBreederId(n: number): BreederId {
  return `${BREEDER_ID_PREFIX}${String(n).padStart(BREEDER_ID_DIGITS, '0')}`;
}

/** 비율 배열을 정수 두수로 나눈다(최대 나머지법, 나머지가 같으면 앞 순서가 먼저). rng 를 쓰지 않는다. */
function splitByShare(total: number, shares: readonly number[]): number[] {
  const raw = shares.map((s) => total * s);
  const counts = raw.map((v) => Math.floor(v));
  let remaining = total - counts.reduce((sum, c) => sum + c, 0);
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (remaining <= 0) break;
    counts[i] = (counts[i] ?? 0) + 1;
    remaining -= 1;
  }
  return counts;
}

/** 가중치로 인덱스 하나를 고른다. rng.next() 를 정확히 1회 쓴다. */
function pickIndexByWeight(rng: Rng, weights: readonly number[]): number {
  let total = 0;
  for (const w of weights) total += w;
  if (!(total > 0)) {
    throw new RangeError('상업 생산자 배정: 가중치 합이 0 이하다');
  }
  const target = rng.next() * total;
  let cumulative = 0;
  for (let i = 0; i < weights.length; i++) {
    cumulative += weights[i] ?? 0;
    if (target < cumulative) return i;
  }
  return weights.length - 1;
}

/** 한 나라의 생산자 규모 목록(수는 나라별 설정, 규모 순서는 rng 로 섞는다) */
function scalesForCountry(total: number, rng: Rng): BreederScale[] {
  const counts = splitByShare(
    total,
    BREEDER_SCALE_ORDER.map((s) => BREEDER_SCALE_SHARE[s]),
  );
  const scales: BreederScale[] = [];
  BREEDER_SCALE_ORDER.forEach((scale, i) => {
    for (let k = 0; k < (counts[i] ?? 0); k++) scales.push(scale);
  });
  return rng.shuffle(scales);
}

/** 목장 이름 한 개. 마주 studName·이미 쓴 생산자 이름·차단 목록과 겹치면 다시 뽑는다. */
function drawStudName(
  rng: Rng,
  ctx: PeopleContext,
  home: NameCountry,
  used: Set<string>,
): string {
  for (let attempt = 0; attempt < BREEDER_NAME_MAX_ATTEMPTS; attempt++) {
    const name = makeStudName(rng, ctx, home);
    const key = normalizeFullName(name);
    if (used.has(key) || ctx.blocked.has(key)) continue;
    used.add(key);
    return name;
  }
  throw new Error(`상업 생산자: ${home} 목장 이름을 ${BREEDER_NAME_MAX_ATTEMPTS}회 안에 뽑지 못했다`);
}

/**
 * 상업 생산자 전체를 만든 새 상태를 돌려준다(원본 state 는 바꾸지 않는다, structuredClone).
 * 나라 순서(POPULATION_COUNTRY_ORDER) → 번호 순으로 ID 를 붙인다. 목장 이름은 마주 studName 과 겹치지 않는다.
 * 이미 상업 생산자가 있으면 Error(이중 초기화 방지). 인물 초기화(bootstrapPeople) 뒤에 부른다.
 */
export function generateBreeders(state: GameState, data: PeopleStaticData, rng: Rng): GameState {
  if (Object.keys(state.breeders).length > 0) {
    throw new Error('generateBreeders: 이미 상업 생산자가 있다(이중 초기화)');
  }
  const next = structuredClone(state);
  const ctx = createPeopleContext(data, next.date.year);

  const usedNames = new Set<string>();
  for (const owner of Object.values(next.owners)) {
    if (owner.studName !== null) usedNames.add(normalizeFullName(owner.studName));
  }

  let no = 0;
  for (const country of POPULATION_COUNTRY_ORDER) {
    if (!isNameCountry(country)) {
      throw new RangeError(`상업 생산자: 이름 풀이 없는 국가 ${country}`);
    }
    const scales = scalesForCountry(BREEDER_COUNT_BY_COUNTRY[country], rng);
    for (const scale of scales) {
      no += 1;
      const id = formatBreederId(no);
      const name = drawStudName(rng, ctx, country, usedNames);
      const range = BREEDER_FUNDS_RANGE[scale];
      const breeder: CommercialBreeder = {
        id,
        name,
        country,
        scale,
        funds: rng.int(range.min, range.max),
        horseIds: [],
      };
      next.breeders[id] = breeder;
    }
  }
  return next;
}

/**
 * 현역마 한 마리의 생산자를 고른다. 독립 스트림 createRng(`${initialSeed}:breeder:${horse.id}`) 만 쓴다.
 * 1) owner 가 있고 studName 이 있으면 OWNER_BREEDER_SHARE[tier] 확률로 owner.id(오너브리더).
 * 2) 그 밖: 말의 countryOfBirth 와 같은 나라 상업 생산자 중 규모 가중치로 추첨. 그 나라에 없으면 전체에서.
 * 3) 생산자가 하나도 없으면(옛 저장본) owner 가 있으면 owner.id, 없으면 null.
 * owner 가 null 이면 오너브리더 단계를 건너뛴다(플레이어 지급 말).
 */
export function pickBreederFor(
  state: GameState,
  horse: Horse,
  owner: Owner | null,
): OwnerId | BreederId | null {
  const rng = createRng(`${state.initialSeed}:breeder:${horse.id}`);

  if (owner !== null && owner.studName !== null) {
    if (rng.chance(OWNER_BREEDER_SHARE[owner.tier])) return owner.id;
  }

  const all = Object.values(state.breeders).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const sameCountry = all.filter((b) => b.country === horse.countryOfBirth);
  const pool = sameCountry.length > 0 ? sameCountry : all;
  if (pool.length === 0) return owner?.id ?? null;

  const index = pickIndexByWeight(
    rng,
    pool.map((b) => BREEDER_PICK_WEIGHT[b.scale]),
  );
  return (pool[index] as CommercialBreeder).id;
}
