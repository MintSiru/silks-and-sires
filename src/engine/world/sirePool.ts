import { PROFILE_DISTANCE, TIER_FEE } from '../config/world';
import type { GameState, RealStallionRecord } from '../types';

/** 종부료와 로그 거리가 가장 가까운 시장 등급. 동점이면 상위 등급을 쓴다. */
export function tierFromFee(fee: number): RealStallionRecord['marketTier'] {
  let tier: RealStallionRecord['marketTier'] = 1;
  let closest = Infinity;
  for (const candidate of [1, 2, 3, 4, 5] as const) {
    const distance = Math.abs(Math.log(fee / TIER_FEE[candidate]));
    if (distance < closest) {
      closest = distance;
      tier = candidate;
    }
  }
  return tier;
}

/** AI 현역마 출신 종마를 기존 부 선택 경로에서 쓸 합성 레코드로 만든다. */
export function aiSireRecords(state: GameState): RealStallionRecord[] {
  const records: RealStallionRecord[] = [];
  for (const id of Object.keys(state.stallions).sort()) {
    const stallion = state.stallions[id];
    if (!stallion?.aiEntrant) continue;
    const horse = state.horses[stallion.horseId];
    if (horse === undefined) continue;
    let distanceProfile: RealStallionRecord['distanceProfile'] = 'speed';
    let closest = Infinity;
    for (const profile of Object.keys(PROFILE_DISTANCE) as (keyof typeof PROFILE_DISTANCE)[]) {
      const distance = Math.abs(horse.aptitude.distanceOptimum - PROFILE_DISTANCE[profile]);
      if (distance < closest) {
        closest = distance;
        distanceProfile = profile;
      }
    }
    records.push({
      key: stallion.horseId,
      foaled: horse.birthYear,
      countryOfBirth: stallion.standsIn,
      standsIn: stallion.standsIn,
      sireKey: null,
      damsireKey: null,
      sireLineId: stallion.sireLineId,
      status: 'active',
      distanceProfile,
      surfaceProfile: 'turf',
      marketTier: tierFromFee(stallion.fee),
      confidence: 'low',
      firstCoverYear: stallion.firstSeasonYear,
      ...(stallion.lastSeasonYear === undefined ? {} : { lastCoverYear: stallion.lastSeasonYear }),
    });
  }
  return records;
}

/** 교배 연도가 종마의 사망·은퇴 경계를 넘지 않았는가. 마지막 시즌은 포함한다. */
export function standingInCoverYear(state: GameState, stallionKey: string, coverYear: number): boolean {
  const horse = state.horses[stallionKey];
  if (horse === undefined || (horse.diedYear !== undefined && coverYear > horse.diedYear)) return false;
  const lastSeasonYear = state.stallions[stallionKey]?.lastSeasonYear;
  return lastSeasonYear === undefined || coverYear <= lastSeasonYear;
}

/** 정적 순서 뒤에 AI 종마를 붙이고 교배 연도의 은퇴·사망을 확인한다. 변화 없으면 참조도 보존한다. */
export function sirePoolFor(
  state: GameState,
  records: readonly RealStallionRecord[],
  coverYear: number,
): readonly RealStallionRecord[] {
  const aiRecords = aiSireRecords(state);
  const staticKeys = new Set(records.map((record) => record.key));
  const additions = aiRecords.filter((record) => !staticKeys.has(record.key));
  if (additions.length === 0 && records.every((record) => standingInCoverYear(state, record.key, coverYear))) {
    return records;
  }
  return [...records, ...additions].filter((record) => standingInCoverYear(state, record.key, coverYear));
}
