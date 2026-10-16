import {
  FIELD_SIZE_CONDITIONS,
  FIELD_SIZE_GROUP,
  FIELD_SIZE_HANDICAP,
  FIELD_SIZE_LISTED,
  GROUP_OR_FLOOR,
  GROUP_SCORE_NOISE_SD,
  JUVENILE_AGE,
  JUVENILE_BASE_WEIGHT,
  JUVENILE_FOCUS_WEIGHT,
  MIN_FIELD_SIZE,
  RACE_GRADE_ORDER,
  TRAVEL_CHANCE_GROUP,
  TRAVEL_COUNTRIES,
  type FieldSizeRange,
} from '../config/entries';
import { racingHorseIds } from '../world/population';
import { RIVAL_BIG_RACE_ENTRY_WEIGHT } from '../config/rivals';
import { createRng, rngFromState } from '../rng';
import { meanAbility } from '../world/rating';
import { ageInYear } from '../time/calendar';
import type {
  CountryCode,
  Declaration,
  GameDate,
  GameState,
  Horse,
  HorseId,
  Meeting,
  OwnerId,
  Race,
  RaceGrade,
  Rng,
  ScheduledRace,
} from '../types';
import { isDistanceFit, isEligible, raceCountryOf, type CourseCountryLookup } from './eligibility';
import { pickWeighted } from './generateRace';

/** 레이스 종류별 목표 두수 범위 */
function fieldSizeRange(race: Race): FieldSizeRange {
  switch (race.kind) {
    case 'group':
      return FIELD_SIZE_GROUP;
    case 'listed':
      return FIELD_SIZE_LISTED;
    case 'handicap':
      return FIELD_SIZE_HANDICAP;
    default:
      return FIELD_SIZE_CONDITIONS;
  }
}

/** 그룹·리스티드 여부(OR 기준 선발) */
function isGroupLike(race: Race): boolean {
  return race.kind === 'group' || race.kind === 'listed';
}

function gradeRank(grade: RaceGrade | null): number {
  if (grade === null) return RACE_GRADE_ORDER.length;
  return RACE_GRADE_ORDER.indexOf(grade);
}

/**
 * 선언 처리 순서 키: [묶음, 세부]. 그룹(등급순) → 리스티드 → 핸디캡(클래스 오름) → 메이든·노비스·조건.
 */
function priorityKey(race: Race): readonly [number, number] {
  if (race.kind === 'group') return [0, gradeRank(race.grade)];
  if (race.kind === 'listed') return [1, gradeRank(race.grade)];
  if (race.kind === 'handicap') return [2, race.raceClass];
  return [3, 0];
}

function compareKey(a: readonly [number, number], b: readonly [number, number]): number {
  return a[0] - b[0] || a[1] - b[1];
}

/** 그룹·리스티드의 선발 값. 3세 이상은 OR(하한 미달·없음이면 null), 2세는 잠재 평균 */
function groupValue(horse: Horse, age: number, race: Race): number | null {
  if (age <= JUVENILE_AGE) {
    return meanAbility(horse.potential);
  }
  const or = horse.officialRating;
  if (or === null) return null;
  const floor = race.grade === null ? Number.NEGATIVE_INFINITY : GROUP_OR_FLOOR[race.grade];
  return or >= floor ? or : null;
}

/** 나라 조건. 나라를 모르면 제한 없음. 그룹 레이스만 다른 유럽 나라 말이 확률적으로 원정 후보가 된다. */
function countryAllows(horse: Horse, race: Race, raceCountry: CountryCode | null, rng: Rng): boolean {
  if (raceCountry === null || horse.countryOfBirth === raceCountry) return true;
  if (race.kind !== 'group') return false;
  if (!TRAVEL_COUNTRIES.includes(horse.countryOfBirth)) return false;
  return rng.chance(TRAVEL_CHANCE_GROUP);
}

/** 2세 경주 가중: 2세만 조교사 juvenileFocus 를 반영한다 */
function selectionWeight(state: GameState, horse: Horse, age: number): number {
  if (age > JUVENILE_AGE) return JUVENILE_BASE_WEIGHT;
  const trainer = horse.trainerId === null ? undefined : state.trainers[horse.trainerId];
  return JUVENILE_BASE_WEIGHT + JUVENILE_FOCUS_WEIGHT * (trainer?.juvenileFocus ?? 0);
}

/** 가중치 비복원 추출. pickWeighted 를 n 번 쓴다(rng 소비 고정). */
function weightedSample<T>(rng: Rng, items: readonly T[], weightOf: (item: T) => number, n: number): T[] {
  const rest = [...items];
  const out: T[] = [];
  while (out.length < n && rest.length > 0) {
    const idx = pickWeighted(
      rng,
      rest.map((item, i) => ({ value: i, weight: weightOf(item) })),
    );
    const [picked] = rest.splice(idx, 1);
    if (picked !== undefined) out.push(picked);
  }
  return out;
}

interface Candidate {
  horse: Horse;
  ownerId: OwnerId;
  /** 그룹·리스티드 선발 값(그 외 null) */
  value: number | null;
}

interface SelectContext {
  state: GameState;
  rng: Rng;
  /** 이번 주 이미 선언된 말 */
  weekUsed: Set<HorseId>;
  /** AI 현역마(id 오름차순) */
  pool: readonly Horse[];
  rivalWeights: ReadonlyMap<OwnerId, number>;
}

/** 실제 플레이어 접수가 있는 G1만 견제 대상이다. */
function rivalTarget(state: GameState, sr: ScheduledRace): boolean {
  return sr.race.grade === 'G1' && sr.declarations.some((d) => d.ownerId === state.playerOwnerId);
}

function rivalWeights(state: GameState): Map<OwnerId, number> {
  return new Map((state.rivals ?? []).filter((r) => r.active && r.intensity > 0 && state.owners[r.ownerId] !== undefined)
    .map((r) => [r.ownerId, 1 + r.intensity / 100 * RIVAL_BIG_RACE_ENTRY_WEIGHT]));
}

/** 레이스 한 개에 채울 말을 고른다(최대 need 두). 후보가 모자라면 있는 만큼. */
function selectHorses(
  ctx: SelectContext,
  race: Race,
  date: GameDate,
  raceCountry: CountryCode | null,
  need: number,
  challenge: boolean,
): Candidate[] {
  const cands: Candidate[] = [];
  for (const horse of ctx.pool) {
    if (ctx.weekUsed.has(horse.id)) continue;
    if (horse.ownerId === null) continue;
    if (!isEligible(horse, race, date, ctx.state.seasonState)) continue;
    if (!isDistanceFit(horse, race)) continue;
    if (!countryAllows(horse, race, raceCountry, ctx.rng)) continue;
    const age = ageInYear(horse.birthYear, date.year);
    let value: number | null = null;
    if (isGroupLike(race)) {
      value = groupValue(horse, age, race);
      if (value === null) continue;
    }
    cands.push({ horse, ownerId: horse.ownerId, value });
  }

  if (isGroupLike(race)) {
    const scored = cands.map((c) => ({
      c,
      // 자격·거리·나라·OR 판단을 통과한 기존 후보의 선발 점수만 가중한다. 추가 난수 없음.
      score: ((c.value ?? 0) + ctx.rng.normal(0, GROUP_SCORE_NOISE_SD))
        * (challenge ? ctx.rivalWeights.get(c.ownerId) ?? 1 : 1),
    }));
    scored.sort((a, b) => b.score - a.score || (a.c.horse.id < b.c.horse.id ? -1 : 1));
    return scored.slice(0, need).map((s) => s.c);
  }
  if (race.kind === 'handicap') {
    return ctx.rng.shuffle(cands).slice(0, need);
  }
  return weightedSample(
    ctx.rng,
    cands,
    (c) => selectionWeight(ctx.state, c.horse, ageInYear(c.horse.birthYear, date.year)),
    need,
  );
}

/**
 * AI 마주의 출주를 정한다(순수 함수: 입력 meetings 는 바꾸지 않고 새 배열을 돌려준다).
 * - 그룹 → 리스티드 → 핸디캡(클래스 오름) → 메이든·노비스·조건 순으로 status 'open' 레이스를 채운다.
 * - 이미 있는 선언(플레이어 포함)은 유지하고 목표 두수에서 뺀다. 한 말은 그 주에 한 레이스만 나간다.
 * - 채운 뒤 'closed'. 총 두수가 MIN_FIELD_SIZE 미만이면 'abandoned'(AI 선언을 넣지 않는다).
 * - courseCountry 를 주면 레이스 나라 기준으로 같은 나라 말만(그룹은 원정 후보 포함) 고른다.
 * 같은 state·meetings·rng 상태면 결과가 같다.
 */
export function declareAiRunners(
  state: GameState,
  meetings: readonly Meeting[],
  rng: Rng,
  courseCountry: CourseCountryLookup,
): Meeting[] {
  const weights = rivalWeights(state);
  if (weights.size === 0 || !meetings.some((m) => m.races.some((sr) => sr.status === 'open' && rivalTarget(state, sr)))) {
    return declareRunners(state, meetings, rng, courseCountry, new Map());
  }
  // 가중 선발로 weekUsed 가 달라지면 뒤 레이스의 후보 수와 난수 소비도 바뀐다.
  // 공용 스트림은 기존 경로로만 진행시키고, 동일한 시작 상태의 복제 스트림에서 가중 결과를 계산한다.
  const effectRng = rngFromState(rng.getState());
  declareRunners(state, meetings, rng, courseCountry, new Map());
  return declareRunners(state, meetings, effectRng, courseCountry, weights);
}

function declareRunners(
  state: GameState,
  meetings: readonly Meeting[],
  rng: Rng,
  courseCountry: CourseCountryLookup,
  weights: ReadonlyMap<OwnerId, number>,
): Meeting[] {
  const out: Meeting[] = structuredClone([...meetings]);

  const weekUsed = new Set<HorseId>();
  for (const m of out) {
    for (const sr of m.races) {
      for (const d of sr.declarations) weekUsed.add(d.horseId);
    }
  }

  const pool: Horse[] = [];
  for (const id of racingHorseIds(state)) {
    const horse = state.horses[id];
    if (horse !== undefined) pool.push(horse);
  }
  const ctx: SelectContext = { state, rng, weekUsed, pool, rivalWeights: weights };

  interface Slot {
    mi: number;
    ri: number;
    key: readonly [number, number];
  }
  const slots: Slot[] = [];
  out.forEach((m, mi) => {
    m.races.forEach((sr, ri) => {
      if (sr.status === 'open') {
        slots.push({ mi, ri, key: priorityKey(sr.race) });
      }
    });
  });
  slots.sort((a, b) => compareKey(a.key, b.key) || a.mi - b.mi || a.ri - b.ri);

  for (const slot of slots) {
    const meeting = out[slot.mi];
    const sr = meeting?.races[slot.ri];
    if (meeting === undefined || sr === undefined) continue;

    const range = fieldSizeRange(sr.race);
    const target = Math.min(rng.int(range.min, range.max), sr.race.maxRunners);
    const need = target - sr.declarations.length;
    const raceCountry = raceCountryOf(courseCountry, sr.race.racecourseId);
    const picks = need > 0 ? selectHorses(ctx, sr.race, meeting.date, raceCountry, need, rivalTarget(state, sr)) : [];

    if (sr.declarations.length + picks.length < MIN_FIELD_SIZE) {
      sr.status = 'abandoned';
      continue;
    }
    for (const p of picks) {
      const decl: Declaration = {
        horseId: p.horse.id,
        ownerId: p.ownerId,
        trainerId: p.horse.trainerId,
        jockeyId: null,
        weightLb: null,
        isPlayer: false,
      };
      sr.declarations.push(decl);
      weekUsed.add(p.horse.id);
    }
    sr.status = 'closed';
  }

  return out;
}

/**
 * AI는 전주에 미리 접수한다. 이후 들어온 플레이어 G1 접수는 개최 확정 때 독립 스트림으로 재검토한다.
 * 동일 스트림의 무가중 선발과 비교해 가중 덕분에 선발된 라이벌 말만 기존 비라이벌 말과 교체한다.
 * 다른 레이스 접수·목표 두수·기존 후보 판단을 지키고, 견제할 후보가 없으면 기존 선언 그대로다.
 */
export function reconsiderRivalG1Entries(
  state: GameState, meetings: readonly Meeting[], courseCountry: CourseCountryLookup,
): Meeting[] {
  const weights = rivalWeights(state);
  if (weights.size === 0) return [...meetings];
  const targets = meetings.flatMap((m) => m.races.filter((sr) => sr.status === 'open'
    && rivalTarget(state, sr) && sr.declarations.some((d) => !d.isPlayer)));
  if (targets.length === 0) return [...meetings];
  const prepared = structuredClone([...meetings]);
  for (let mi = 0; mi < prepared.length; mi++) {
    for (const sr of prepared[mi]!.races) {
      const original = meetings[mi]!.races.find((r) => r.race.id === sr.race.id)!;
      if (targets.includes(original)) sr.declarations = sr.declarations.filter((d) => d.isPlayer);
      else if (sr.status === 'open') sr.status = 'closed';
    }
  }
  const date = meetings[0]!.date;
  const rng = createRng(`${state.initialSeed}:rival-effect:entries:${date.year}:${date.week}`);
  const baseline = declareRunners(state, prepared, rngFromState(rng.getState()), courseCountry, new Map());
  const challenged = declareRunners(state, prepared, rng, courseCountry, weights);
  const out = structuredClone([...meetings]);
  const used = new Set(out.flatMap((m) => m.races.flatMap((sr) => sr.declarations.map((d) => d.horseId))));
  out.forEach((m, mi) => m.races.forEach((sr, ri) => {
    if (!targets.includes(meetings[mi]!.races[ri]!)) return;
    const previous = baseline[mi]!.races[ri]!.declarations;
    const additions = challenged[mi]!.races[ri]!.declarations.filter((d) => !d.isPlayer && weights.has(d.ownerId)
      && !previous.some((p) => p.horseId === d.horseId) && !used.has(d.horseId));
    for (const addition of additions) {
      const displaced = sr.declarations.filter((d) => !d.isPlayer && !weights.has(d.ownerId))
        .sort((a, b) => (state.horses[a.horseId]?.officialRating ?? 0) - (state.horses[b.horseId]?.officialRating ?? 0)
          || a.horseId.localeCompare(b.horseId))[0];
      if (displaced === undefined) break;
      sr.declarations[sr.declarations.indexOf(displaced)] = addition;
      used.delete(displaced.horseId);
      used.add(addition.horseId);
    }
  }));
  return out;
}
