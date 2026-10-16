import {
  JOCKEY_PICK_BASE_WEIGHT,
  MIN_FIELD_SIZE,
  MIN_RACE_WEIGHT_LB,
  WFA_OLDER_MIN_AGE,
} from '../config/entries';
import type { EntryRequest } from '../race/setup';
import type { SampleField } from '../race/sampleField';
import { ageInYear, monthOfWeek } from '../time/calendar';
import type {
  CountryCode,
  Declaration,
  GameDate,
  GameState,
  Horse,
  HorseId,
  Jockey,
  JockeyId,
  Owner,
  OwnerId,
  Race,
  Rng,
  RunnerInput,
  ScheduledRace,
} from '../types';
import { raceCountryOf, type CourseCountryLookup } from './eligibility';
import { pickWeighted } from './generateRace';
import { handicapWeights, sexAllowanceLb, wfaAllowanceLb } from './weights';

export interface BuildRaceFieldResult {
  /** runRace 의 field 입력 */
  field: SampleField;
  /** Declaration 의 jockeyId·weightLb(감량 전)를 채운 새 개최 레이스. 상태·나머지 필드는 그대로 */
  race: ScheduledRace;
}

function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new RangeError(`buildRaceField: 인덱스 범위 밖 (${index})`);
  }
  return item;
}

function requireHorse(state: GameState, id: HorseId): Horse {
  const horse = state.horses[id];
  if (horse === undefined) throw new Error(`buildRaceField: 말 ${id} 없음`);
  return horse;
}

function requireOwner(state: GameState, id: OwnerId): Owner {
  const owner = state.owners[id];
  if (owner === undefined) throw new Error(`buildRaceField: 마주 ${id} 없음`);
  return owner;
}

/** 기수 목록(id 오름차순). 순회 순서를 고정해 결정성을 지킨다. */
function sortedJockeys(state: GameState): Jockey[] {
  return Object.keys(state.jockeys)
    .sort()
    .map((id) => state.jockeys[id])
    .filter((j): j is Jockey => j !== undefined);
}

/**
 * 감량 전 부담중량(lb) 목록(declarations 순서).
 * - 핸디캡: handicapWeights(OR, baseWeightLb). 성별·WFA 감량 없음.
 * - 그 외: baseWeightLb − WFA(3세, 4세 이상 상대 레이스에서만) − 성별 감량.
 */
function preAllowanceWeights(horses: readonly Horse[], race: Race, date: GameDate): number[] {
  const base = race.conditions.baseWeightLb;
  if (race.kind === 'handicap' || race.conditions.weightSystem === 'handicap') {
    const ors = horses.map((h) => {
      if (h.officialRating === null) {
        throw new RangeError(`buildRaceField: 핸디캡 레이스인데 OR 이 없는 말 ${h.id}`);
      }
      return h.officialRating;
    });
    return handicapWeights(ors, base);
  }

  const month = monthOfWeek(date.week);
  const { maxAge, weightSystem } = race.conditions;
  const openToOlder = maxAge === null || maxAge >= WFA_OLDER_MIN_AGE;
  return horses.map((h) => {
    const age = ageInYear(h.birthYear, date.year);
    const wfa = weightSystem === 'wfa' && openToOlder ? wfaAllowanceLb(age, month, race.distance) : 0;
    return base - wfa - sexAllowanceLb(h, race);
  });
}

/** 기수가 이 부담중량에 탈 수 있는가(은퇴 안 함, 이 레이스에서 중복 아님, 최저 기승 체중 이상) */
function rideable(j: Jockey, weight: number, used: ReadonlySet<JockeyId>): boolean {
  return !j.retired && !used.has(j.id) && weight >= j.minRidingWeightLb;
}

/** 기수 배정 결과. weightLb 는 실제 부담중량(과체중이면 배정 중량보다 무겁다) */
interface RiderPick {
  jockey: Jockey;
  weightLb: number;
}

/**
 * 전속 예약(M4-B3a). 이 레이스에 선언한 마주의 retainedJockeyId 중, 그 마주의 선언마 하나 이상에 탈 수 있는 기수.
 * - reserved: 예약 기수 집합. 다른 마주의 말은 이 기수를 무작위·과체중 대체 후보에서 뺀다.
 * - byIndex: 선언 인덱스 → 그 말에 타는 예약 기수(마주의 첫 번째 탈 수 있는 선언마).
 */
interface RetainerReservation {
  reserved: ReadonlySet<JockeyId>;
  byIndex: ReadonlyMap<number, Jockey>;
}

function reserveRetainers(state: GameState, owners: readonly Owner[], weights: readonly number[]): RetainerReservation {
  const reserved = new Set<JockeyId>();
  const byIndex = new Map<number, Jockey>();
  const doneOwners = new Set<OwnerId>();
  owners.forEach((owner, i) => {
    if (owner.retainedJockeyId === null || doneOwners.has(owner.id)) return;
    const jockey = state.jockeys[owner.retainedJockeyId];
    if (jockey === undefined || reserved.has(jockey.id)) return;
    if (!rideable(jockey, at(weights, i), new Set<JockeyId>())) return;
    doneOwners.add(owner.id);
    reserved.add(jockey.id);
    byIndex.set(i, jockey);
  });
  return { reserved, byIndex };
}

/**
 * 기수 한 명 배정(예약 기수가 아닌 말).
 * 1) 같은 나라 기수 중 skill 가중 무작위(예약 기수 제외). 같은 나라에 없으면 전체 기수에서 같은 방식으로 고른다.
 * 2) 탈 수 있는 기수가 한 명도 없으면(과체중): 미사용·예약 제외 기수 중 최저 기승 체중이 가장 낮은 기수를 쓰고,
 *    실제 부담중량은 그 기수의 최저 기승 체중으로 올린다(overweight).
 * 예약 기수 집합이 비면 전속 예약 도입 전과 같은 후보·같은 난수 소비다.
 */
function pickJockey(
  jockeys: readonly Jockey[],
  owner: Owner,
  weight: number,
  used: ReadonlySet<JockeyId>,
  raceCountry: CountryCode | null,
  reserved: ReadonlySet<JockeyId>,
  rng: Rng,
): RiderPick {
  const free = (j: Jockey): boolean => !reserved.has(j.id) && rideable(j, weight, used);
  let pool = jockeys.filter((j) => (raceCountry === null || j.country === raceCountry) && free(j));
  if (pool.length === 0) {
    pool = jockeys.filter(free);
  }
  if (pool.length > 0) {
    const jockey = pickWeighted(
      rng,
      pool.map((j) => ({ value: j, weight: JOCKEY_PICK_BASE_WEIGHT + j.skill })),
    );
    return { jockey, weightLb: weight };
  }

  const lightest = jockeys
    .filter((j) => !j.retired && !used.has(j.id) && !reserved.has(j.id))
    .sort((a, b) => a.minRidingWeightLb - b.minRidingWeightLb || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
  if (lightest === undefined) {
    throw new Error(`buildRaceField: 기수가 부족해 배정할 수 없다(마주 ${owner.id})`);
  }
  return { jockey: lightest, weightLb: Math.max(weight, lightest.minRidingWeightLb) };
}

/** 엔진 RunnerInput.horse 용 Pick 필드(참조 공유 없이 복사) */
function horseSnapshot(horse: Horse): RunnerInput['horse'] & Pick<Horse, 'formVariance'> {
  return {
    id: horse.id,
    name: horse.name,
    sex: horse.sex,
    birthYear: horse.birthYear,
    ability: { ...horse.ability },
    aptitude: { ...horse.aptitude },
    condition: structuredClone(horse.condition),
    preferredStyle: horse.preferredStyle,
    personality: { ...horse.personality },
    ...(horse.formVariance === undefined ? {} : { formVariance: horse.formVariance }),
  };
}

/**
 * 확정 단계: 개최 레이스의 선언 말에 기수·부담중량·견습 감량·작전·승부복을 붙여 SampleField 를 만든다.
 * - 부담중량(Declaration.weightLb, EntryRequest.weightLb)은 감량 전 값이다. 견습 감량은 jockeyAllowanceLb 로 따로 준다.
 * - 견습 감량은 그룹·리스티드에서 0.
 * - 같은 레이스에 같은 기수는 없다. 기수 최저 기승 체중 조건을 지킨다.
 * - courseCountry 를 주면 기수는 레이스 나라에서 고른다(없으면 전체 기수 대상).
 * - 같은 state·sr·date·rng 상태면 결과가 같다. 선언이 2두 미만이거나 abandoned 면 RangeError.
 */
export function buildRaceField(
  state: GameState,
  sr: ScheduledRace,
  date: GameDate,
  rng: Rng,
  courseCountry: CourseCountryLookup,
): BuildRaceFieldResult {
  const { race, declarations } = sr;
  if (sr.status === 'abandoned') {
    throw new RangeError('buildRaceField: 취소된 레이스(abandoned)는 확정할 수 없다');
  }
  if (declarations.length < MIN_FIELD_SIZE) {
    throw new RangeError(`buildRaceField: 선언이 ${MIN_FIELD_SIZE}두 미만(${declarations.length}두)`);
  }
  if (declarations.length > race.maxRunners) {
    throw new RangeError(`buildRaceField: 선언 두수(${declarations.length})가 최대(${race.maxRunners})를 넘는다`);
  }

  const horses = declarations.map((d) => requireHorse(state, d.horseId));
  const owners = declarations.map((d) => requireOwner(state, d.ownerId));
  // 배정 중량: 조건별 감량 후 하한 MIN_RACE_WEIGHT_LB 적용(견습 감량 전)
  const weights = preAllowanceWeights(horses, race, date).map((w) => Math.max(MIN_RACE_WEIGHT_LB, w));
  const raceCountry = raceCountryOf(courseCountry, race.racecourseId);
  const jockeys = sortedJockeys(state);
  const noAllowance = race.kind === 'group' || race.kind === 'listed';

  const reservation = reserveRetainers(state, owners, weights);
  const used = new Set<JockeyId>();
  const picked: Jockey[] = [];
  const actualWeights: number[] = [];
  declarations.forEach((_, i) => {
    const reservedJockey = reservation.byIndex.get(i);
    const rider: RiderPick =
      reservedJockey !== undefined
        ? { jockey: reservedJockey, weightLb: at(weights, i) }
        : pickJockey(jockeys, at(owners, i), at(weights, i), used, raceCountry, reservation.reserved, rng);
    used.add(rider.jockey.id);
    picked.push(rider.jockey);
    actualWeights.push(rider.weightLb);
  });

  const requests: EntryRequest[] = [];
  const runners: SampleField['runners'] = [];
  const ownerNames: string[] = [];
  const newDeclarations: Declaration[] = declarations.map((d, i) => {
    const horse = at(horses, i);
    const owner = at(owners, i);
    const jockey = at(picked, i);
    const weight = at(actualWeights, i);
    requests.push({
      horseId: horse.id,
      jockeyId: jockey.id,
      tactic: horse.preferredStyle,
      silks: { ...owner.silks },
      isPlayer: d.isPlayer,
      weightLb: weight,
      jockeyAllowanceLb: noAllowance ? 0 : jockey.apprenticeAllowanceLb,
    });
    runners.push({
      horse: horseSnapshot(horse),
      jockey: { id: jockey.id, name: jockey.name, skill: jockey.skill },
    });
    ownerNames.push(owner.name);
    return { ...d, jockeyId: jockey.id, weightLb: weight };
  });

  return {
    field: { runners, requests, ownerNames },
    race: { ...sr, declarations: newDeclarations },
  };
}
