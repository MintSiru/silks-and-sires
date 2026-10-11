import { NAME_MAX_LENGTH } from '../config/horse';
import {
  FERTILITY_MAX,
  FERTILITY_MEAN,
  FERTILITY_MIN,
  FERTILITY_SD,
  FIRST_SEASON_AGE,
  PROFILE_DISTANCE,
  STALLION_SPREAD,
  TIER_BOOK_LIMIT,
  TIER_FEE,
  TIER_LEVEL,
  TIER_POPULARITY,
} from '../config/world';
import { generateHorse } from '../horse/generate';
import type {
  Horse,
  HorseStatus,
  RealStallionRecord,
  RealStallionStatus,
  Rng,
  Stallion,
  StallionNameTable,
} from '../types';

/** 실명 종마 상태 → 말 생애 단계 */
const HORSE_STATUS_BY_REAL: Record<RealStallionStatus, HorseStatus> = {
  active: 'stud',
  pensioned: 'retired',
  historical: 'historical',
};

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** key 오름차순 정렬 복사본. 원본 배열은 바꾸지 않는다(localeCompare 미사용: 환경 독립 정렬). */
export function sortStallionRecords(records: readonly RealStallionRecord[]): RealStallionRecord[] {
  return [...records].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/**
 * 실명 종마 레코드로 Horse 를 만들고, 현역(active) 종마에 한해 Stallion 을 만든다.
 * records 는 key 오름차순으로 처리한다(같은 시드 = 같은 결과).
 * 이름이 names 에 없거나 NAME_MAX_LENGTH 를 넘으면 Error, 중복 key 도 Error.
 */
export function createRealStallionHorses(
  rng: Rng,
  records: readonly RealStallionRecord[],
  names: StallionNameTable,
  currentYear: number,
): { horses: Horse[]; stallions: Stallion[] } {
  const horses: Horse[] = [];
  const stallions: Stallion[] = [];
  const seenKeys = new Set<string>();

  for (const rec of sortStallionRecords(records)) {
    if (seenKeys.has(rec.key)) {
      throw new Error(`실명 종마 key 중복: ${rec.key}`);
    }
    seenKeys.add(rec.key);

    const name = names[rec.key];
    if (name === undefined) {
      throw new Error(`실명 종마 이름이 없음: ${rec.key}`);
    }
    if (name.length > NAME_MAX_LENGTH) {
      throw new Error(`실명 종마 이름이 ${NAME_MAX_LENGTH}자를 넘는다: ${name}`);
    }

    const horse = generateHorse(rng, {
      id: rec.key,
      name,
      sex: 'male',
      birthYear: rec.foaled,
      currentYear,
      countryOfBirth: rec.countryOfBirth,
      status: HORSE_STATUS_BY_REAL[rec.status],
      level: TIER_LEVEL[rec.marketTier],
      spread: STALLION_SPREAD,
      sireId: rec.sireKey,
      damId: null,
      familyId: null,
      sireLineId: rec.sireLineId,
      distanceBias: PROFILE_DISTANCE[rec.distanceProfile],
      surfaceBias: rec.surfaceProfile === 'dirt' ? 'dirt' : undefined,
    });
    horses.push(horse);

    if (rec.status === 'active') {
      const standsIn = rec.standsIn;
      if (standsIn === null) {
        throw new Error(`현역 종마에 계류국이 없음: ${rec.key}`);
      }
      stallions.push({
        horseId: rec.key,
        realKey: rec.key,
        sireLineId: rec.sireLineId,
        fee: TIER_FEE[rec.marketTier],
        bookLimit: TIER_BOOK_LIMIT[rec.marketTier],
        bookedThisSeason: 0,
        fertility: clamp(rng.normal(FERTILITY_MEAN, FERTILITY_SD), FERTILITY_MIN, FERTILITY_MAX),
        popularity: TIER_POPULARITY[rec.marketTier],
        standsIn,
        firstSeasonYear: rec.foaled + FIRST_SEASON_AGE,
      });
    }
  }

  return { horses, stallions };
}
