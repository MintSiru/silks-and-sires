/**
 * 전속 계약 (M4-B3b). 계약금 산정(retainerFee)·제의 판정(retainerQuote)·체결(signRetainer)·해지(terminateRetainer)·
 * 연초 갱신 시스템(createContractsSystem, id 'contracts', 주 1 에만 동작).
 * 관계·명성의 세부 처리는 relations.ts 가 맡고, 여기서는 계약을 만들고 갱신하고 없애는 일과 돈만 다룬다.
 * 모든 돈 변화는 recordMoney 로만 한다. 난수·시계 미사용. 같은 상태 → 같은 결과.
 */
import { WEEKS_PER_YEAR } from '../config/game';
import {
  RELATION_ROUND_DECIMALS,
  RETAINER_FEE_ROUND,
  RETAINER_JOCKEY_BASE_FEE,
  RETAINER_JOCKEY_FEE_PER_SKILL_SQ,
  RETAINER_MAX_PER_KIND,
  RETAINER_MIN_RELATION,
  RETAINER_RELATION_DISCOUNT_CAP,
  RETAINER_RELATION_DISCOUNT_DIVISOR,
  RETAINER_RELATION_FLOOR,
  RETAINER_RENEW_MIN_RELATION,
  RETAINER_STANDING_BASE,
  RETAINER_STANDING_RELATION_WEIGHT,
  RETAINER_TERMINATION_PENALTY_RATE,
  RETAINER_TERMINATION_RELATION_HIT,
  RETAINER_TRAINER_BASE_FEE,
  RETAINER_TRAINER_FEE_PER_SKILL_SQ,
  RETAINER_YOUNG_JOCKEY_AGE,
  RETAINER_YOUNG_TRAINER_AGE,
  RETAINER_YOUTH_FEE_MULT,
  RETAINER_YOUTH_STATURE_DISCOUNT,
} from '../config/economy';
import type { PlayerResult } from '../season/player';
import type {
  GameDate,
  GameEvent,
  GameState,
  Money,
  RelationKey,
  RetainerContract,
  WeeklySystem,
} from '../types';
import { contractFor } from './contractQuery';
import { recordMoney } from './ledger';
import { adjustRelation, relationKey, relationOf } from './relations';
import { canSpendDiscretionary } from './solvency';

/** 계약 종류 */
export type RetainerKind = RetainerContract['kind'];

/** 제의 거절 사유(검사 순서대로 첫 사유를 낸다) */
export type RetainerRefusal =
  | 'not_found'
  | 'retired'
  | 'already_contracted'
  | 'slot_full'
  | 'retained_elsewhere'
  | 'relation_too_low'
  | 'standing_too_low';

/** 제의 결과: 가능하면 계약금, 아니면 거절 사유 */
export type RetainerQuote = { ok: true; fee: Money } | { ok: false; reason: RetainerRefusal };

/** 연초 갱신을 판정하는 주 번호(연초 첫 주) */
const RENEWAL_WEEK = 1;

const ROUND_FACTOR = 10 ** RELATION_ROUND_DECIMALS;

/** 계약 판정에 쓰는 사람 정보(기수·조교사 공통 모양) */
interface PersonView {
  skill: number;
  birthYear: number;
  retired: boolean;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** 계약금 반올림(RETAINER_FEE_ROUND 단위, 정수) */
function roundFee(v: number): Money {
  return Math.round(v / RETAINER_FEE_ROUND) * RETAINER_FEE_ROUND;
}

/** 관계값 반올림(소수 둘째 자리) */
function roundRelation(v: number): number {
  return Math.round(v * ROUND_FACTOR) / ROUND_FACTOR;
}

/** 사람 정보. 없으면 undefined. 조교사는 은퇴하지 않는 것으로 본다 */
function personView(state: GameState, kind: RetainerKind, personId: string): PersonView | undefined {
  if (kind === 'jockey') {
    const jockey = state.jockeys[personId];
    if (jockey === undefined) return undefined;
    return { skill: jockey.skill, birthYear: jockey.birthYear, retired: jockey.retired };
  }
  const trainer = state.trainers[personId];
  if (trainer === undefined) return undefined;
  return { skill: trainer.skill, birthYear: trainer.birthYear, retired: false };
}

/** 젊은 사람인가(나이 ≤ 종류별 기준) */
function isYoung(kind: RetainerKind, age: number): boolean {
  return age <= (kind === 'jockey' ? RETAINER_YOUNG_JOCKEY_AGE : RETAINER_YOUNG_TRAINER_AGE);
}

/** 계약 정렬 순서: kind, personId 오름차순 */
function compareContracts(a: RetainerContract, b: RetainerContract): number {
  if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
  if (a.personId !== b.personId) return a.personId < b.personId ? -1 : 1;
  return 0;
}

/** 기수 전속 링크 설정(owner.retainedJockeyId, jockey.retainedBy) */
function linkJockey(draft: GameState, personId: string): void {
  const owner = draft.owners[draft.playerOwnerId];
  const jockey = draft.jockeys[personId];
  if (owner === undefined) throw new Error(`contracts: 플레이어 마주가 없음: ${draft.playerOwnerId}`);
  if (jockey === undefined) throw new Error(`contracts: 기수가 없음: ${personId}`);
  owner.retainedJockeyId = personId;
  jockey.retainedBy = draft.playerOwnerId;
}

/** 기수 전속 링크 해제(플레이어가 가진 링크만 지운다). 사람이 없으면 마주 쪽만 지운다 */
function unlinkJockey(draft: GameState, personId: string): void {
  const owner = draft.owners[draft.playerOwnerId];
  if (owner !== undefined && owner.retainedJockeyId === personId) {
    owner.retainedJockeyId = null;
  }
  const jockey = draft.jockeys[personId];
  if (jockey !== undefined && jockey.retainedBy === draft.playerOwnerId) {
    jockey.retainedBy = null;
  }
}

/** 계약 한 건을 목록에서 지우고 기수 링크를 푼다 */
function removeContract(draft: GameState, kind: RetainerKind, personId: string): void {
  draft.relations.contracts = draft.relations.contracts.filter(
    (c) => !(c.kind === kind && c.personId === personId),
  );
  if (kind === 'jockey') unlinkJockey(draft, personId);
}

/**
 * 계약금(€, 정수): 기본 + skill² × 계수 → × (1 − clamp(관계, 0, CAP) / DIVISOR) → 젊으면 × 젊음 배수 → 반올림.
 * 사람이 없으면 오류(호출자는 retainerQuote 로 먼저 확인한다).
 */
export function retainerFee(state: GameState, kind: RetainerKind, personId: string): Money {
  const person = personView(state, kind, personId);
  if (person === undefined) throw new Error(`retainerFee: 사람이 없음: ${kind}:${personId}`);

  const base = kind === 'jockey' ? RETAINER_JOCKEY_BASE_FEE : RETAINER_TRAINER_BASE_FEE;
  const perSkillSq = kind === 'jockey' ? RETAINER_JOCKEY_FEE_PER_SKILL_SQ : RETAINER_TRAINER_FEE_PER_SKILL_SQ;
  let fee = base + person.skill * person.skill * perSkillSq;

  const relation = relationOf(state, relationKey(kind, personId));
  const discountBase = clamp(relation, 0, RETAINER_RELATION_DISCOUNT_CAP);
  fee *= 1 - discountBase / RETAINER_RELATION_DISCOUNT_DIVISOR;

  const age = state.date.year - person.birthYear;
  if (isYoung(kind, age)) fee *= RETAINER_YOUTH_FEE_MULT;

  return roundFee(fee);
}

/** 거절 결과를 만든다 */
function refuse(reason: RetainerRefusal): RetainerQuote {
  return { ok: false, reason };
}

/**
 * 제의 판정(결정적). 검사 순서: 없음 → 은퇴 → 이미 계약 → 종류별 상한 → (기수) 다른 마주 전속 → 관계 하한 → 위상.
 * 위상 = 명성 + 관계 × WEIGHT + BASE, 요구 위상 = skill − (젊으면 STATURE_DISCOUNT). 위상 < 요구 위상이면 거절.
 */
export function retainerQuote(state: GameState, kind: RetainerKind, personId: string): RetainerQuote {
  const person = personView(state, kind, personId);
  if (person === undefined) return refuse('not_found');
  if (person.retired) return refuse('retired');
  if (contractFor(state, kind, personId) !== undefined) return refuse('already_contracted');

  const sameKind = state.relations.contracts.filter((c) => c.kind === kind).length;
  if (sameKind >= RETAINER_MAX_PER_KIND) return refuse('slot_full');

  if (kind === 'jockey') {
    const retainedBy = state.jockeys[personId]?.retainedBy ?? null;
    if (retainedBy !== null && retainedBy !== state.playerOwnerId) return refuse('retained_elsewhere');
  }

  const relation = relationOf(state, relationKey(kind, personId));
  if (relation < RETAINER_MIN_RELATION) return refuse('relation_too_low');

  const age = state.date.year - person.birthYear;
  const young = isYoung(kind, age);
  const standing =
    state.relations.reputation + relation * RETAINER_STANDING_RELATION_WEIGHT + RETAINER_STANDING_BASE;
  const required = person.skill - (young ? RETAINER_YOUTH_STATURE_DISCOUNT : 0);
  if (standing < required) return refuse('standing_too_low');

  return { ok: true, fee: retainerFee(state, kind, personId) };
}

/** 체결 때 관계를 하한까지 올린다(이미 높으면 그대로, 소수 둘째 자리 반올림) */
function raiseRelationToFloor(draft: GameState, key: RelationKey): void {
  const current = relationOf(draft, key);
  draft.relations.values[key] = roundRelation(Math.max(current, RETAINER_RELATION_FLOOR));
}

/**
 * 계약 체결. 첫 해 지불액 = round(계약금 × (53 − 현재 주) / 52)(주 1 이면 전액, 주 52 면 1/52).
 * 자금 판정은 canSpendDiscretionary 로 한다. 입력 state 는 바꾸지 않는다.
 */
export function signRetainer(
  state: GameState,
  kind: RetainerKind,
  personId: string,
): PlayerResult<RetainerRefusal | 'insufficient_funds'> {
  const quote = retainerQuote(state, kind, personId);
  if (!quote.ok) return { ok: false, error: quote.reason };

  const fee = quote.fee;
  const firstPay = Math.round((fee * (WEEKS_PER_YEAR + 1 - state.date.week)) / WEEKS_PER_YEAR);
  if (!canSpendDiscretionary(state, firstPay)) return { ok: false, error: 'insufficient_funds' };

  const next = structuredClone(state);
  const date: GameDate = { year: state.date.year, week: state.date.week };
  const year = state.date.year;

  recordMoney(next, next.playerOwnerId, 'retainer_fee', -firstPay, date);
  next.relations.contracts = [
    ...next.relations.contracts,
    { kind, personId, startYear: year, endYear: year, annualFee: fee },
  ].sort(compareContracts);
  raiseRelationToFloor(next, relationKey(kind, personId));
  if (kind === 'jockey') linkJockey(next, personId);

  const event: GameEvent = { type: 'retainer_changed', kind, personId, change: 'signed', fee: firstPay, date };
  return { ok: true, state: next, events: [event] };
}

/**
 * 계약 해지. 위약금 = round(연간 계약금 × PENALTY_RATE)(자금이 모자라도 진행). 계약을 지운 뒤 관계 −HIT
 * (계약이 없어졌으므로 하한 없음). 기수면 전속 링크를 푼다. 입력 state 는 바꾸지 않는다.
 */
export function terminateRetainer(
  state: GameState,
  kind: RetainerKind,
  personId: string,
): PlayerResult<'not_contracted'> {
  const contract = contractFor(state, kind, personId);
  if (contract === undefined) return { ok: false, error: 'not_contracted' };

  const next = structuredClone(state);
  const date: GameDate = { year: state.date.year, week: state.date.week };
  const penalty = Math.round(contract.annualFee * RETAINER_TERMINATION_PENALTY_RATE);

  recordMoney(next, next.playerOwnerId, 'retainer_fee', -penalty, date);
  removeContract(next, kind, personId);
  adjustRelation(next, relationKey(kind, personId), -RETAINER_TERMINATION_RELATION_HIT);

  const event: GameEvent = { type: 'retainer_changed', kind, personId, change: 'terminated', fee: penalty, date };
  return { ok: true, state: next, events: [event] };
}

/** 연초 갱신 판정 한 건. 계약을 고치거나 지우고 이벤트를 돌려준다 */
function renewOne(draft: GameState, contract: RetainerContract, year: number, date: GameDate): GameEvent {
  const { kind, personId } = contract;
  if (draft.yearEnd.declinedRenewals.includes(`${kind}:${personId}`)) {
    removeContract(draft, kind, personId);
    return { type: 'retainer_changed', kind, personId, change: 'released', fee: 0, date };
  }
  const person = personView(draft, kind, personId);
  if (person === undefined || person.retired) {
    removeContract(draft, kind, personId);
    return { type: 'retainer_changed', kind, personId, change: 'lapsed', fee: 0, date };
  }

  const relation = relationOf(draft, relationKey(kind, personId));
  if (relation < RETAINER_RENEW_MIN_RELATION) {
    removeContract(draft, kind, personId);
    return { type: 'retainer_changed', kind, personId, change: 'declined', fee: 0, date };
  }

  const fee = retainerFee(draft, kind, personId);
  if (!canSpendDiscretionary(draft, fee)) {
    removeContract(draft, kind, personId);
    return { type: 'retainer_changed', kind, personId, change: 'lapsed', fee: 0, date };
  }

  recordMoney(draft, draft.playerOwnerId, 'retainer_fee', -fee, date);
  contract.endYear = year;
  contract.annualFee = fee;
  return { type: 'retainer_changed', kind, personId, change: 'renewed', fee, date };
}

/**
 * 계약 연초 시스템(id 'contracts'). 주 1(연초)에만 동작하며, endYear < 올해인 계약을 kind·personId 순으로 판정한다.
 * 사람이 없거나 은퇴 → lapsed / 관계 < RENEW_MIN_RELATION → declined / 자금 부족 → lapsed / 그 밖 → 전액 지불 후 renewed.
 * 갱신 뒤 endYear 가 올해가 되므로 같은 해에 다시 돌아도 갱신하지 않는다. 난수 미사용.
 */
export function createContractsSystem(): WeeklySystem {
  return {
    id: 'contracts',
    run(draft: GameState, ctx): GameEvent[] {
      if (ctx.date.week !== RENEWAL_WEEK) return [];
      const year = ctx.date.year;
      const date: GameDate = { year, week: ctx.date.week };
      const due = draft.relations.contracts.filter((c) => c.endYear < year).sort(compareContracts);
      const events: GameEvent[] = [];
      for (const contract of due) {
        events.push(renewOne(draft, contract, year, date));
      }
      draft.yearEnd.declinedRenewals = [];
      return events;
    },
  };
}
