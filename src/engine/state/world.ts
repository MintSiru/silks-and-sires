import { initialRevealedNicks } from '../breeding/nicks';
import {
  DAM_AGE_GAP_MAX,
  DAM_AGE_GAP_MIN,
  HORSE_ID_DIGITS,
  HORSE_ID_PREFIX,
  MARE_AGE_MAX,
  MARE_AGE_MIN,
  MARE_COUNTRIES,
  MARE_LEVEL,
  MARE_LEVEL_SPREAD,
  MARE_SIRE_TIER_WEIGHT,
  MIN_SIRE_AGE_AT_COVER,
  PLAYER_START_MARES,
  SIRE_BIRTH_MARGIN_YEARS,
} from '../config/world';
import { generateHorse, generateHorseName, type HorseWords } from '../horse/generate';
import type {
  GameState,
  Horse,
  HorseId,
  Mare,
  NickEntry,
  RealStallionRecord,
  Rng,
  StallionNameTable,
} from '../types';
import { createRealStallionHorses, sortStallionRecords } from './stallionHorses';

/** 새 게임 초기화에 필요한 정적 데이터 묶음 */
export interface WorldStaticData {
  stallionRecords: readonly RealStallionRecord[];
  stallionNames: StallionNameTable;
  nicks: readonly NickEntry[];
  words: HorseWords;
}

/**
 * 가상 말 ID 를 발급한다(`h-000001` 형식). state.nextHorseNumber 를 1 올린다(state 직접 수정).
 */
export function allocateHorseId(state: GameState): HorseId {
  const id = `${HORSE_ID_PREFIX}${String(state.nextHorseNumber).padStart(HORSE_ID_DIGITS, '0')}`;
  state.nextHorseNumber += 1;
  return id;
}

/** 교배 부(父) 후보의 가장 늦은 출생 연도 */
function latestSireFoaledYear(foalYear: number): number {
  return foalYear - SIRE_BIRTH_MARGIN_YEARS - MIN_SIRE_AGE_AT_COVER;
}

/**
 * 후보 목록(key 오름차순)에서 MARE_SIRE_TIER_WEIGHT 가중으로 한 마리를 고른다.
 * rng.next() 를 정확히 1회 쓴다.
 */
function pickWeightedSire(rng: Rng, candidates: readonly RealStallionRecord[]): RealStallionRecord {
  if (candidates.length === 0) {
    throw new RangeError('pickWeightedSire: 부(父) 후보가 없다');
  }
  let total = 0;
  for (const c of candidates) {
    total += MARE_SIRE_TIER_WEIGHT[c.marketTier];
  }
  const target = rng.next() * total;
  let cumulative = 0;
  for (const c of candidates) {
    cumulative += MARE_SIRE_TIER_WEIGHT[c.marketTier];
    if (target < cumulative) return c;
  }
  return candidates[candidates.length - 1] as RealStallionRecord;
}

/**
 * 실명 종마 Horse·Stallion 레코드와 플레이어 기초 번식 암말을 넣은 새 상태를 돌려준다.
 * 원본 state 는 바꾸지 않는다(structuredClone). 같은 입력 + 같은 rng 상태 → 같은 결과.
 */
export function bootstrapWorld(state: GameState, data: WorldStaticData, rng: Rng): GameState {
  if (Object.keys(state.stallions).length > 0 || Object.keys(state.mares).length > 0) {
    throw new Error('bootstrapWorld: 이미 초기화된 세계다(종마 또는 번식 암말이 있음)');
  }
  const next = structuredClone(state);
  const currentYear = next.date.year;

  const playerOwner = next.owners[next.playerOwnerId];
  if (playerOwner === undefined) {
    throw new Error(`플레이어 마주가 없음: ${next.playerOwnerId}`);
  }

  // 1. 실명 종마
  const realRecords = sortStallionRecords(data.stallionRecords);
  const real = createRealStallionHorses(rng, realRecords, data.stallionNames, currentYear);
  for (const horse of real.horses) {
    next.horses[horse.id] = horse;
  }
  for (const stallion of real.stallions) {
    next.stallions[stallion.horseId] = stallion;
  }

  // 2. 시작 공개 닉스
  next.breeding.revealedNicks = initialRevealedNicks(data.nicks);

  // 3. 이름 중복 방지 집합
  const used = new Set<string>(Object.values(next.horses).map((h) => h.name));

  // 4. 플레이어 기초 암말
  const isCoverSire = (r: RealStallionRecord): boolean =>
    r.status === 'active' || r.status === 'pensioned';

  for (let i = 0; i < PLAYER_START_MARES; i++) {
    // a. 나이·출생 연도·출생국
    const age = rng.int(MARE_AGE_MIN, MARE_AGE_MAX);
    const birthYear = currentYear - age;
    const country = rng.pick(MARE_COUNTRIES);

    // b. 암말의 부 (현역·은퇴 종마 중 가중 선택)
    const mareSireRec = pickWeightedSire(
      rng,
      realRecords.filter((r) => isCoverSire(r) && r.foaled <= latestSireFoaledYear(birthYear)),
    );

    // c. 어미(가상)와 어미의 부 (historical 포함 모든 종마)
    const gap = rng.int(DAM_AGE_GAP_MIN, DAM_AGE_GAP_MAX);
    const damBirth = birthYear - gap;
    const damSireRec = pickWeightedSire(
      rng,
      realRecords.filter((r) => r.foaled <= latestSireFoaledYear(damBirth)),
    );
    const damId = allocateHorseId(next);
    const damName = generateHorseName(rng, data.words, used);
    const dam: Horse = generateHorse(rng, {
      id: damId,
      name: damName,
      sex: 'female',
      birthYear: damBirth,
      currentYear,
      countryOfBirth: country,
      status: 'historical',
      level: MARE_LEVEL,
      spread: MARE_LEVEL_SPREAD,
      sireId: damSireRec.key,
      damId: null,
      familyId: damId,
      sireLineId: damSireRec.sireLineId,
    });
    next.horses[dam.id] = dam;

    // d. 기초 암말
    const mareId = allocateHorseId(next);
    const mareName = generateHorseName(rng, data.words, used);
    const mare: Horse = generateHorse(rng, {
      id: mareId,
      name: mareName,
      sex: 'female',
      birthYear,
      currentYear,
      countryOfBirth: country,
      status: 'broodmare',
      level: MARE_LEVEL,
      spread: MARE_LEVEL_SPREAD,
      sireId: mareSireRec.key,
      damId: dam.id,
      familyId: dam.id,
      sireLineId: mareSireRec.sireLineId,
      ownerId: next.playerOwnerId,
      breederId: next.playerOwnerId,
    });
    next.horses[mare.id] = mare;

    // e. 번식 레코드와 소유 연결
    const mareRecord: Mare = {
      horseId: mare.id,
      coveredBy: null,
      pregnant: false,
      dueWeek: null,
      foals: [],
      blackTypeProduce: 0,
    };
    next.mares[mare.id] = mareRecord;
    playerOwner.horseIds.push(mare.id);
  }

  return next;
}
