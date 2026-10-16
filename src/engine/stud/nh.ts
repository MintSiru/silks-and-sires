import * as config from '../config/nh';
import { getStallionRecords } from '../data/staticData';
import { profileOfDistance } from '../horse/generate';
import { createRng } from '../rng';
import type { DistanceProfile, GameState, Horse, HorseId, Money, Rng, Stallion, StudRole } from '../types';
import { meanAbility } from '../world/rating';

const records = new Map(getStallionRecords().map(record => [record.key, record]));

/** 기존 적성 경계값을 공유한다. 실명 부마의 확정 프로필은 sireNhValue 에서 별도로 쓴다. */
export function horseProfile(horse: Horse): DistanceProfile {
  return profileOfDistance(horse.aptitude.distanceOptimum);
}

export function sireNhValue(state: GameState, sireId: HorseId | null): number {
  if (sireId === null) return config.NH_VALUE_BY_PROFILE.classic;
  const stallion = state.stallions[sireId];
  const record = records.get(stallion?.realKey ?? sireId);
  const horse = state.horses[sireId];
  const profile = record?.distanceProfile ?? (horse ? horseProfile(horse) : 'classic');
  const role = stallion?.studRole ?? record?.studRole ?? 'flat';
  return config.NH_VALUE_BY_PROFILE[profile] * config.NH_ROLE_VALUE_MULT[role];
}

/** 공용 rng 는 받지 않는다. 선택적으로 전달하는 rng 역시 호출자의 독립 스트림이어야 한다. */
export function chooseStudRole(state: GameState, horse: Horse, rng?: Rng): StudRole {
  const profile = horseProfile(horse);
  if (profile === 'speed' || profile === 'classic') return 'flat';
  const random = rng ?? createRng(`${state.initialSeed}:stud-role:${horse.id}`);
  const nh = config.NH_VALUE_BY_PROFILE[profile];
  const flat = config.FLAT_VALUE_BY_PROFILE[profile];
  if (!random.chance(nh / (nh + flat))) return 'flat';
  return random.chance(config.NH_ROLE_SPECIALIST_SHARE[profile]) ? 'nh' : 'dual';
}

/** 원본을 보존한다. 신규 평지 기준 레코드에 한 번 적용하는 변환이다. */
export function applyStudRole(stallion: Stallion, role: StudRole): Stallion {
  const feeRatio = role === 'nh' ? config.NH_FEE_RATIO : role === 'dual' ? config.DUAL_FEE_RATIO : 1;
  const bookMult = role === 'nh' ? config.NH_BOOK_MULT : role === 'dual' ? config.DUAL_BOOK_MULT : 1;
  return { ...stallion, studRole: role, fee: Math.round(stallion.fee * feeRatio),
    ...(stallion.marketBaseFee === undefined ? {} : { marketBaseFee: Math.round(stallion.marketBaseFee * feeRatio) }),
    bookLimit: Math.round(stallion.bookLimit * bookMult),
    ...(role === 'flat' ? {} : { nhReputation: stallion.nhReputation ?? config.NH_REPUTATION_NEUTRAL }) };
}

/** 같은 해·말이면 같은 가격 흔들림.조회는 상태나 공용 난수를 바꾸지 않는다. */
export function nhStoreQuote(state: GameState, horseId: HorseId): Money | null {
  const horse = state.horses[horseId];
  if (horse === undefined) return null;
  const reputation = horse.sireId === null ? config.NH_REPUTATION_NEUTRAL
    : state.stallions[horse.sireId]?.nhReputation ?? config.NH_REPUTATION_NEUTRAL;
  const jitter = createRng(`${state.initialSeed}:nh-store-price:${horseId}:${state.date.year}`)
    .range(1 - config.NH_STORE_PRICE_JITTER, 1 + config.NH_STORE_PRICE_JITTER);
  return Math.round(config.NH_STORE_BASE_PRICE
    * (config.NH_STORE_SIRE_BASE + config.NH_STORE_SIRE_WEIGHT * sireNhValue(state, horse.sireId))
    * (config.NH_STORE_REPUTATION_BASE + reputation / (2 * config.NH_REPUTATION_MAX))
    * (config.NH_STORE_POTENTIAL_BASE + meanAbility(horse.potential) / config.NH_REPUTATION_MAX) * jitter);
}
