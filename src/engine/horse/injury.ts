/** 부상 선택·진단·치료·회복. 추가 판정은 공용 난수를 소비하지 않는다. */
import {
  COLIC_DEATH_CHANCE, INJURY_AUTO_DIAGNOSE_WEEKS, INJURY_FRACTURE_AI_RETIRE_CHANCE,
  INJURY_GOING_MULT, INJURY_HISTORY_LIMIT, INJURY_KINDS, INJURY_LATE_DIAGNOSIS_MULT,
  INJURY_RECUR_YEARS, INJURY_WINTER_MONTHS, INJURY_WINTER_RESPIRATORY_MULT, VET_EXAM_COST,
} from '../config/injury';
import { SORE_SHINS_KNOCK_AGE } from '../config/conditioning';
import { WEEKS_PER_YEAR } from '../config/game';
import { recordMoney } from '../economy/ledger';
import { canSpendDiscretionary } from '../economy/solvency';
import { createRng } from '../rng';
import { monthOfWeek, weeksBetween } from '../time/calendar';
import type {
  GameDate, GameEvent, GameState, Going, Horse, Injury, InjuryKind, InjuryRecord,
  InjuryTreatment, PermanentInjuryEffect, Rng,
} from '../types';

export interface InjuryContext {
  date: GameDate;
  initialSeed: number;
  isPlayer: boolean;
  notable?: boolean;
  going?: Going;
  events?: GameEvent[];
  catastrophicInjuries?: boolean;
  raceId?: string;
}
export interface InjuryRollContext {
  horse?: Horse;
  date?: GameDate;
  going?: Going;
  racing?: boolean;
  isPlayer?: boolean;
  initialSeed?: number;
}

function treatmentRng(seed: number, horseId: string, injury: Pick<Injury, 'kind' | 'since' | 'treatment'>): Rng {
  const since = injury.since;
  return createRng(`${seed}:injury-treatment:${horseId}:${injury.kind}:${since === undefined ? 'legacy' : `${since.year}-${since.week}`}:${injury.treatment ?? 'rest'}`);
}
function treatmentWorks(seed: number, horseId: string, injury: Pick<Injury, 'kind' | 'since' | 'treatment'>): boolean {
  const def = INJURY_KINDS[injury.kind].treatments[injury.treatment ?? 'rest'];
  return def !== undefined && treatmentRng(seed, horseId, injury).chance(def.successRate);
}

/** 같은 부위의 최근 병력이 있으면 재발 배수. 치료가 성공한 병력은 감소 계수를 적용한다. */
export function injuryRecurrenceMultiplier(kind: InjuryKind, horse: Horse, date: GameDate, initialSeed = 0): number {
  const def = INJURY_KINDS[kind];
  let multiplier = 1;
  for (const record of horse.injuryHistory ?? []) {
    const elapsed = weeksBetween(record.since, date);
    if (elapsed < 0 || elapsed > INJURY_RECUR_YEARS * WEEKS_PER_YEAR) continue;
    if (INJURY_KINDS[record.kind].region !== def.region) continue;
    const treatment = INJURY_KINDS[record.kind].treatments[record.treatment];
    const relief = treatmentWorks(initialSeed, horse.id, record) ? (treatment?.recurMult ?? 1) : 1;
    multiplier = Math.max(multiplier, def.recurMult * relief);
  }
  return multiplier;
}

/** 종류별 가중치만 바꾼다. 전체 발생 확률은 conditioning 에서 유지한다. */
export function injuryWeights(age: number, context: InjuryRollContext = {}): Record<InjuryKind, number> {
  const weights = {} as Record<InjuryKind, number>;
  for (const kind of Object.keys(INJURY_KINDS) as InjuryKind[]) {
    const def = INJURY_KINDS[kind];
    let weight = context.racing === true ? def.racingWeight : def.trainingWeight;
    if (context.going !== undefined) weight *= INJURY_GOING_MULT[context.going]?.[def.region] ?? 1;
    if (kind === 'respiratory' && context.date !== undefined && INJURY_WINTER_MONTHS.includes(monthOfWeek(context.date.week))) {
      weight *= INJURY_WINTER_RESPIRATORY_MULT;
    }
    if (context.horse !== undefined && context.date !== undefined) {
      weight *= injuryRecurrenceMultiplier(kind, context.horse, context.date, context.initialSeed);
    }
    weights[kind] = weight;
  }
  // 2~3세 한정. 성마·당세/1세의 추첨 몫은 knock 으로 옮겨 전체 발생률을 보존한다.
  if (age >= SORE_SHINS_KNOCK_AGE || age < 2) {
    weights.knock += weights.sore_shins;
    weights.sore_shins = 0;
  }
  return weights;
}

/** 공용 RNG 는 기존처럼 종류 next 1회·기간 int 1회만 쓴다. */
export function rollInjury(age: number, rng: Rng, context: InjuryRollContext = {}): Injury {
  const weights = injuryWeights(age, context);
  let target = rng.next() * Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  let kind: InjuryKind = 'knock';
  for (const entry of Object.keys(INJURY_KINDS) as InjuryKind[]) {
    target -= weights[entry];
    if (target < 0) { kind = entry; break; }
  }
  const def = INJURY_KINDS[kind];
  const injury: Injury = { kind, weeksOut: rng.int(def.minWeeks, def.maxWeeks),
    diagnosed: !(context.isPlayer === true && def.subtle) };
  if (context.date !== undefined) injury.since = { ...context.date };
  return injury;
}

/** 남은 기간을 1주 줄이고, 3주 경과 시 회복 처리보다 먼저 지연 확진한다. */
export function progressInjuryInPlace(horse: Horse, context: InjuryContext): void {
  const injury = horse.condition.injury;
  if (injury === null) return;
  injury.since ??= { ...context.date };
  injury.weeksOut--;
  if (injury.diagnosed === false && weeksBetween(injury.since, context.date) >= INJURY_AUTO_DIAGNOSE_WEEKS) {
    injury.diagnosed = true;
    injury.weeksOut = Math.max(1, Math.ceil(injury.weeksOut * INJURY_LATE_DIAGNOSIS_MULT));
    if (context.isPlayer) context.events?.push({ type: 'injury_diagnosed', horseId: horse.id,
      kind: injury.kind, weeksOut: injury.weeksOut, date: { ...context.date } });
  }
  // 짧은 잠복 질환도 미확진 상태로 병력에서 사라지지 않게 한다.
  if (injury.weeksOut <= 0 && injury.diagnosed !== false) finishInjuryInPlace(horse, context);
  else if (injury.weeksOut <= 0) injury.weeksOut = 1;
}

/** 복귀·은퇴·사망을 한 번만 확정하고 실제 능력 감소량을 병력에 남긴다. */
export function finishInjuryInPlace(horse: Horse, context: InjuryContext): void {
  const injury = horse.condition.injury;
  if (injury === null) return;
  const def = INJURY_KINDS[injury.kind];
  const treatment = injury.treatment ?? 'rest';
  const works = treatmentWorks(context.initialSeed, horse.id, injury);
  const treatmentDef = def.treatments[treatment];
  const since = injury.since ?? context.date;
  const rng = createRng(`${context.initialSeed}:injury-recovery:${horse.id}:${since.year}-${since.week}:${injury.kind}`);
  const deathChance = works ? COLIC_DEATH_CHANCE[treatment] : COLIC_DEATH_CHANCE.rest;
  const dies = injury.kind === 'colic' && rng.chance(deathChance);
  const retires = !dies && injury.kind === 'fracture' && !context.isPlayer && rng.chance(INJURY_FRACTURE_AI_RETIRE_CHANCE);
  const record: InjuryRecord = { kind: injury.kind, since: { ...since },
    weeks: Math.max(1, weeksBetween(since, context.date)), treatment };
  const permanentMult = works ? (treatmentDef?.permanentMult ?? 1) : 1;
  if (!dies && rng.chance(def.permanentChance * permanentMult)) {
    const permanent: PermanentInjuryEffect = {};
    for (const key of ['speed', 'stamina'] as const) {
      const loss = def.permanent[key];
      if (loss === undefined) continue;
      const actual = Math.min(loss, horse.ability[key], horse.potential[key]);
      horse.ability[key] -= actual;
      horse.potential[key] -= actual;
      permanent[key] = actual;
    }
    if (def.permanent.formVariance !== undefined) {
      permanent.formVariance = def.permanent.formVariance;
      horse.formVariance = (horse.formVariance ?? 0) + permanent.formVariance;
    }
    record.permanent = permanent;
  }
  horse.injuryHistory = [...(horse.injuryHistory ?? []), record].slice(-INJURY_HISTORY_LIMIT);
  horse.condition.injury = null;
  if (dies || retires) {
    const from = horse.status;
    horse.status = dies ? 'dead' : 'retired';
    horse.trainerId = null;
    if (dies) {
      horse.diedYear = context.date.year;
      if (context.isPlayer || context.notable === true) context.events?.push({ type: 'horse_died', horseId: horse.id,
        cause: 'illness', date: { ...context.date } });
    } else {
      context.events?.push({ type: 'horse_status_changed', horseId: horse.id, from, to: 'retired', date: { ...context.date } });
    }
  }
}

export type InjuryError = 'not_found' | 'not_player_horse' | 'no_injury' | 'already_diagnosed'
  | 'not_diagnosed' | 'not_allowed' | 'already_treated' | 'insufficient_funds';
export type InjuryActionResult = { ok: true; state: GameState; events: GameEvent[] } | { ok: false; error: InjuryError };

function validateHorse(state: GameState, horseId: string): InjuryError | null {
  const horse = state.horses[horseId];
  if (horse === undefined) return 'not_found';
  if (horse.ownerId !== state.playerOwnerId) return 'not_player_horse';
  if (horse.condition.injury === null) return 'no_injury';
  return null;
}

/** 플레이어 부상 API: 이벤트는 events 로만 돌려주고 state.eventLog 는 건드리지 않는다(기록은 호출자 몫, bookCovering 과 같은 규칙) */
export function orderVetExam(state: GameState, horseId: string): InjuryActionResult {
  const error = validateHorse(state, horseId);
  if (error !== null) return { ok: false, error };
  if (state.horses[horseId]!.condition.injury!.diagnosed !== false) return { ok: false, error: 'already_diagnosed' };
  if (!canSpendDiscretionary(state, VET_EXAM_COST)) return { ok: false, error: 'insufficient_funds' };
  const draft = structuredClone(state);
  const injury = draft.horses[horseId]!.condition.injury!;
  injury.diagnosed = true;
  recordMoney(draft, draft.playerOwnerId, 'vet_fee', -VET_EXAM_COST, draft.date, horseId);
  const events: GameEvent[] = [{ type: 'injury_diagnosed', horseId, kind: injury.kind,
    weeksOut: injury.weeksOut, date: { ...draft.date } }];
  return { ok: true, state: draft, events };
}

export function chooseTreatment(state: GameState, horseId: string, treatment: InjuryTreatment): InjuryActionResult {
  const error = validateHorse(state, horseId);
  if (error !== null) return { ok: false, error };
  const current = state.horses[horseId]!.condition.injury!;
  if (current.diagnosed === false) return { ok: false, error: 'not_diagnosed' };
  if (current.treatment === 'medical' || current.treatment === 'surgery') return { ok: false, error: 'already_treated' };
  const def = INJURY_KINDS[current.kind].treatments[treatment];
  if (def === undefined) return { ok: false, error: 'not_allowed' };
  if (def.cost > 0 && !canSpendDiscretionary(state, def.cost)) return { ok: false, error: 'insufficient_funds' };
  const draft = structuredClone(state);
  const injury = draft.horses[horseId]!.condition.injury!;
  injury.since ??= { ...draft.date };
  injury.treatment = treatment;
  const rng = treatmentRng(draft.initialSeed, horseId, injury);
  const works = rng.chance(def.successRate);
  if (def.minWeeks !== undefined && def.maxWeeks !== undefined) injury.weeksOut = rng.int(def.minWeeks, def.maxWeeks);
  else injury.weeksOut = Math.max(1, Math.ceil(injury.weeksOut * (works ? def.weeksMult : 1)));
  recordMoney(draft, draft.playerOwnerId, 'vet_fee', -def.cost, draft.date, horseId);
  const events: GameEvent[] = [{ type: 'injury_treated', horseId, treatment, cost: def.cost,
    weeksOut: injury.weeksOut, date: { ...draft.date } }];
  return { ok: true, state: draft, events };
}
