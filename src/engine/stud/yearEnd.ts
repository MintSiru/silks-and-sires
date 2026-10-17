/**
 * 연말 정산(M4-D1). 설계: docs/m4-stud-design.md
 * 새해 1주를 처리하기 전에 플레이어가 연말 정산을 제출해야 한다. advanceWeek 자체는 막지 않고
 * (해를 넘기는 테스트·자동 시뮬레이션용), 화면은 advanceWeekGated 로만 진행한다.
 */
import { advanceWeek, advanceWeekInPlace } from '../time/advance';
import type { AdvanceResult, GameState, WeeklySystem } from '../types';

import { POPULATION_RETIRE_AGE } from '../config/population';
import { MARE_MIN_BREEDING_AGE } from '../config/breedingSeason';
import { NOMINATION_MAX_PER_SEASON, STUD_MIN_AGE, YEAR_END_GELDING_MAX_AGE, YEAR_END_MARE_BREED_AGE } from '../config/stud';
import type { GameEvent, HorseId, Money, RetainerContract, YearEndChoice, YearEndSubmission } from '../types';
import { canStandAtStud, freeStudSlots, standPlayerStallion } from './stand';
import { mareCapacity, playerBroodmareCount } from '../farm/purchase';
import { applyStudRole, horseProfile } from './nh';
import { estimateStudFee } from './value';
import { applyStallionSale, salePriceQuote } from './trade';

/** 연말 정산 대기 중인지: 새해 1주(아직 처리 전)이고 올해 제출 기록이 없다 */
export function yearEndPending(state: GameState): boolean {
  return state.date.week === 1 && state.yearEnd.lastSubmittedYear < state.date.year;
}

/** 연말 정산이 대기 중이면 진행하지 않고 blocked 를 돌려준다. 그 밖에는 advanceWeek 와 같다 */
export function advanceWeekGated(
  state: GameState,
  systems: readonly WeeklySystem[],
): AdvanceResult & { blocked: 'year_end' | null } {
  if (yearEndPending(state)) return { state, events: [], blocked: 'year_end' };
  return { ...advanceWeek(state, systems), blocked: null };
}

/**
 * 여러 주를 한 번의 상태 복제로 진행한다(M6-P). 연말 정산 대기·파산이면 멈추고, stop(draft) 가 참이면 그 주 뒤에 멈춘다.
 * 결과는 advanceWeekGated 를 반복한 것과 같다(입력 state 는 바꾸지 않는다).
 */
export function advanceWeeksGated(
  state: GameState,
  systems: readonly WeeklySystem[],
  maxWeeks: number,
  stop?: (s: GameState) => boolean,
): AdvanceResult & { blocked: 'year_end' | null } {
  if (maxWeeks <= 0 || state.economy.bankrupt) return { state, events: [], blocked: null };
  if (yearEndPending(state)) return { state, events: [], blocked: 'year_end' };
  const draft = structuredClone(state);
  const events: GameEvent[] = [];
  for (let i = 0; i < maxWeeks; i++) {
    if (yearEndPending(draft)) return { state: draft, events, blocked: 'year_end' };
    if (draft.economy.bankrupt) break;
    events.push(...advanceWeekInPlace(draft, systems));
    if (stop?.(draft)) break;
  }
  return { state: draft, events, blocked: null };
}

export interface YearEndCandidate {
  horseId: HorseId;
  newAge: number;
  allowed: YearEndChoice[];
  recommended: YearEndChoice;
  studFeeEstimate: Money | null;
  salePrice: { domestic: Money; overseas: Money } | null;
}

/** 조회는 상태·난수를 바꾸지 않는다. 위탁마는 매각 절차를 위해 현역을 유지한다. */
export function yearEndCandidates(state: GameState): YearEndCandidate[] {
  const year = state.date.year;
  let mareSlots = Math.max(0, mareCapacity(state) - playerBroodmareCount(state));
  return Object.values(state.horses)
    .filter((horse) => horse.ownerId === state.playerOwnerId
      && (horse.status === 'in_training' || horse.status === 'resting'))
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    .map((horse) => {
      const newAge = year - horse.birthYear;
      const allowed: YearEndChoice[] = [];
      if (state.sales.consignments.some((entry) => entry.horseId === horse.id)) {
        allowed.push('continue');
      } else {
        if (newAge < (horse.gelded ? YEAR_END_GELDING_MAX_AGE : POPULATION_RETIRE_AGE)) {
          allowed.push('continue');
        }
        if (horse.sex === 'male' && !horse.gelded && newAge < YEAR_END_GELDING_MAX_AGE) {
          allowed.push('geld');
        }
        if (canStandAtStud(state, horse.id, year) === null) allowed.push('stud');
        if (horse.sex === 'male' && !horse.gelded && newAge >= STUD_MIN_AGE) {
          allowed.push('sell_domestic', 'sell_overseas');
        }
        if (horse.sex === 'female' && newAge >= MARE_MIN_BREEDING_AGE && state.farm.owned) allowed.push('broodmare');
        allowed.push('retire');
      }
      let recommended: YearEndChoice = (['continue', 'stud', 'retire'] as const)
        .find((choice) => allowed.includes(choice)) ?? 'retire';
      if (horse.sex === 'female' && newAge >= YEAR_END_MARE_BREED_AGE
        && allowed.includes('broodmare') && mareSlots > 0) {
        recommended = 'broodmare';
        mareSlots--;
      }
      const quote = allowed.includes('sell_domestic') ? salePriceQuote(state, horse.id) : null;
      return { horseId: horse.id, newAge, allowed, recommended,
        salePrice: quote === null ? null : { domestic: quote.domestic, overseas: quote.overseas },
        studFeeEstimate: allowed.includes('stud') ? estimateStudFee(state, horse.id).fee : null };
    });
}

export function retainerRenewalsDue(state: GameState): RetainerContract[] {
  return state.relations.contracts.filter((contract) => contract.endYear < state.date.year)
    .sort((a, b) => a.kind < b.kind ? -1 : a.kind > b.kind ? 1
      : a.personId < b.personId ? -1 : a.personId > b.personId ? 1 : 0);
}

export type YearEndError = 'not_pending' | 'wrong_year' | 'missing_horse' | 'duplicate_horse'
  | 'unknown_horse' | 'choice_not_allowed' | 'no_free_slot' | 'retainer_mismatch' | 'invalid_nominations'
  | 'mare_capacity' | 'role_not_allowed';

/** 전체 제출을 검증한 뒤에만 복제본에 적용한다. eventLog 추가는 호출자가 맡는다. */
export function submitYearEnd(
  state: GameState,
  submission: YearEndSubmission,
): { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: YearEndError; horseId?: HorseId } {
  if (!yearEndPending(state)) return { ok: false, error: 'not_pending' };
  const year = state.date.year;
  if (submission.year !== year) return { ok: false, error: 'wrong_year' };
  const candidates = yearEndCandidates(state);
  const byId = new Map(candidates.map((candidate) => [candidate.horseId, candidate]));
  for (const { horseId } of submission.horses) {
    if (!byId.has(horseId)) return { ok: false, error: 'unknown_horse', horseId };
  }
  const seen = new Set<HorseId>();
  for (const { horseId } of submission.horses) {
    if (seen.has(horseId)) return { ok: false, error: 'duplicate_horse', horseId };
    seen.add(horseId);
  }
  for (const { horseId } of candidates) {
    if (!seen.has(horseId)) return { ok: false, error: 'missing_horse', horseId };
  }
  for (const { horseId, choice, nominations = 0, studRole } of submission.horses) {
    if (studRole !== undefined && (choice !== 'stud'
      || !['flat', 'dual', 'nh'].includes(studRole)
      || (studRole === 'nh' && horseProfile(state.horses[horseId]!) === 'speed'))) {
      return { ok: false, error: 'role_not_allowed', horseId };
    }
    if (!Number.isInteger(nominations) || nominations < 0 || nominations > NOMINATION_MAX_PER_SEASON
      || (choice !== 'sell_domestic' && nominations > 0)) {
      return { ok: false, error: 'invalid_nominations', horseId };
    }
    if (!byId.get(horseId)?.allowed.includes(choice)) {
      return { ok: false, error: 'choice_not_allowed', horseId };
    }
  }
  if (submission.horses.filter(({ choice }) => choice === 'stud').length > freeStudSlots(state)) {
    return { ok: false, error: 'no_free_slot' };
  }
  // 이번 제출로 새 번식 암말이 생기는데 총수가 목장 수용 한도를 넘으면 거절(M4-E0b)
  const newMares = submission.horses.filter(({ choice }) => choice === 'broodmare').length;
  if (newMares > 0 && playerBroodmareCount(state) + newMares > mareCapacity(state)) {
    return { ok: false, error: 'mare_capacity' };
  }
  const due = new Set(retainerRenewalsDue(state).map((c) => `${c.kind}:${c.personId}`));
  const submitted = new Set(submission.retainers.map((c) => `${c.kind}:${c.personId}`));
  if (submitted.size !== submission.retainers.length || submitted.size !== due.size
    || [...submitted].some((key) => !due.has(key))) {
    return { ok: false, error: 'retainer_mismatch' };
  }

  const draft = structuredClone(state);
  const events: GameEvent[] = [];
  const date = { year, week: 1 };
  const decisions = [...submission.horses].sort((a, b) =>
    a.horseId < b.horseId ? -1 : a.horseId > b.horseId ? 1 : 0);
  for (const { horseId, choice, nominations = 0, studRole = 'flat' } of decisions) {
    const horse = draft.horses[horseId];
    if (horse === undefined) throw new Error(`submitYearEnd: 말 없음: ${horseId}`);
    if (choice === 'geld') horse.gelded = true;
    if (choice === 'stud') {
      events.push(...standPlayerStallion(draft, horseId, year));
      draft.stallions[horseId] = applyStudRole(draft.stallions[horseId]!, studRole);
    }
    if (choice === 'sell_domestic' || choice === 'sell_overseas') {
      events.push(...applyStallionSale(draft, horseId,
        choice === 'sell_domestic' ? 'domestic' : 'overseas', nominations, date));
    }
    if (choice === 'broodmare' || choice === 'retire') {
      const from = horse.status;
      horse.status = choice === 'broodmare' ? 'broodmare' : 'retired';
      horse.trainerId = null;
      if (choice === 'broodmare') {
        draft.mares[horseId] = { horseId, coveredBy: null, coveredWeek: null, pregnant: false,
          dueWeek: null, foals: [], blackTypeProduce: 0 };
      } else {
        horse.ownerId = null;
        const owner = draft.owners[draft.playerOwnerId];
        if (owner !== undefined) owner.horseIds = owner.horseIds.filter((id) => id !== horseId);
      }
      events.push({ type: 'horse_status_changed', horseId, from, to: horse.status, date });
    }
    if (choice === 'stud' || choice === 'broodmare' || choice === 'retire') {
      for (const meeting of draft.seasonState.meetings) {
        for (const race of meeting.races) {
          if (race.status === 'open') {
            race.declarations = race.declarations.filter((d) => !(d.isPlayer && d.horseId === horseId));
          }
        }
      }
    }
  }
  for (const decision of submission.retainers) {
    if (!decision.renew) draft.yearEnd.declinedRenewals.push(`${decision.kind}:${decision.personId}`);
  }
  draft.yearEnd.lastSubmittedYear = year;
  return { ok: true, state: draft, events };
}
