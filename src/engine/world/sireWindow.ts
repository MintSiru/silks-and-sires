import {
  MAX_STUD_AGE,
  MIN_SIRE_AGE_AT_COVER,
  SIRE_BIRTH_MARGIN_YEARS,
  SIRE_DIRT_WEIGHT_MULT,
  SIRE_HOME_REGION,
  SIRE_OVERSEAS_WEIGHT_MULT,
} from '../config/world';
import type { RealStallionRecord } from '../types';

/**
 * 부(父) 교배 가능 기간 판정(M2-03b). 부 후보 선택은 모두 이 파일의 함수로 한다.
 * 교배 연도 = 자마 출생 연도 − SIRE_BIRTH_MARGIN_YEARS.
 * 교배 가능 기간 = [foaled + MIN_SIRE_AGE_AT_COVER, 마지막 교배 연도].
 */

/** 자마 출생 연도 → 교배 연도 */
export function coverYearForFoal(foalBirthYear: number): number {
  return foalBirthYear - SIRE_BIRTH_MARGIN_YEARS;
}

/**
 * 마지막 교배 연도. lastCoverYear 가 있으면 그 값.
 * 없고 active 이면 null(제한 없음, 현재까지). 없고 그 밖(historical·pensioned)이면 foaled + maxStudAge.
 */
export function lastCoverYearOf(
  record: RealStallionRecord,
  maxStudAge: number = MAX_STUD_AGE,
): number | null {
  if (record.lastCoverYear !== undefined) return record.lastCoverYear;
  if (record.status === 'active') return null;
  return record.foaled + maxStudAge;
}

/** 첫 교배 연도. firstCoverYear 가 있으면 그 값(일찍 종마가 된 말), 없으면 foaled + MIN_SIRE_AGE_AT_COVER */
export function firstCoverYearOf(record: RealStallionRecord): number {
  return record.firstCoverYear ?? record.foaled + MIN_SIRE_AGE_AT_COVER;
}

/** 교배 연도 coverYear 에 이 종마가 교배 가능했는가(기간 양끝 포함) */
export function canSireIn(
  record: RealStallionRecord,
  coverYear: number,
  maxStudAge: number = MAX_STUD_AGE,
): boolean {
  if (coverYear < firstCoverYearOf(record)) return false;
  const last = lastCoverYearOf(record, maxStudAge);
  return last === null || coverYear <= last;
}

/** 교배 기간에서 벗어난 거리(년). 기간 안이면 0. 완화 선택에 쓴다. */
function windowDistance(record: RealStallionRecord, coverYear: number, maxStudAge: number): number {
  const first = firstCoverYearOf(record);
  if (coverYear < first) return first - coverYear;
  const last = lastCoverYearOf(record, maxStudAge);
  if (last !== null && coverYear > last) return coverYear - last;
  return 0;
}

/**
 * 교배 연도 coverYear 의 부 후보를 고른다(입력 순서 유지).
 * 기간 안 후보가 하나도 없으면(데이터 공백 방어) 교배 연도와 가장 가까운 기간의 종마(거리 최솟값 동률 전부)로 완화한다.
 * 결정적이며 난수를 쓰지 않는다. 입력이 비었으면 빈 배열.
 */
export function filterSiresForCover(
  records: readonly RealStallionRecord[],
  coverYear: number,
  maxStudAge: number = MAX_STUD_AGE,
): RealStallionRecord[] {
  const eligible = records.filter((r) => canSireIn(r, coverYear, maxStudAge));
  if (eligible.length > 0 || records.length === 0) return eligible;
  let best = Infinity;
  for (const r of records) {
    best = Math.min(best, windowDistance(r, coverYear, maxStudAge));
  }
  return records.filter((r) => windowDistance(r, coverYear, maxStudAge) === best);
}

/**
 * 유럽 현역마·기초 암말의 부 선택 가중치 배수: 유럽 밖 계류(계류지 없으면 출생국) × SIRE_OVERSEAS_WEIGHT_MULT,
 * 더트 성향 × SIRE_DIRT_WEIGHT_MULT. 다른 가중치에 곱해 쓴다.
 */
export function europeanSireWeightMult(record: RealStallionRecord): number {
  const base = record.standsIn ?? record.countryOfBirth;
  const region = SIRE_HOME_REGION.includes(base) ? 1 : SIRE_OVERSEAS_WEIGHT_MULT;
  return region * (record.surfaceProfile === 'dirt' ? SIRE_DIRT_WEIGHT_MULT : 1);
}
