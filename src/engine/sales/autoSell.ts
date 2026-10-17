/**
 * 판매 담당(M6-0b): 자동 판매 제안 · 제안 빼기 · 지금 위탁 · 자동 위탁 주간 시스템.
 * 설계: docs/specs/M6-0b-auto-sell.md. 출주 계획·교배 제안과 같은 '빼지 않으면 그대로 진행' 방식이다.
 * proposeSales 는 순수 함수(입력 state 불변, 난수 없음). 유보가 계산은 말·해마다 정한 독립 스트림을 쓰고 공용 rng 는 쓰지 않는다.
 * 빼기·지금 위탁·자동 설정은 원본을 바꾸지 않고 복제본을 돌려준다(오류는 { ok: false, error }).
 */
import {
  AUTO_SELL_KEEP_RACERS,
  AUTO_SELL_KEEP_RACERS_IN_DEBT,
  AUTO_SELL_MAX_PER_YEAR,
  AUTO_SELL_POOR_FORM_PENALTY,
  AUTO_SELL_POOR_MIN_STARTS,
  AUTO_SELL_PROPOSE_WEEKS_BEFORE,
  AUTO_SELL_PROTECT_GRADES,
  AUTO_SELL_PROTECT_OR,
  AUTO_SELL_PROTECT_SIRE_FEE,
  AUTO_SELL_RACE_MIN_AGE,
  AUTO_SELL_RESERVE_RATIO,
  AUTO_SELL_YOUNG_BOTTOM_SHARE,
  AUTO_SELL_YOUNG_BOTTOM_SHARE_IN_DEBT,
} from '../config/autoSell';
import { SALE_VALUE_ROUND } from '../config/sales';
import { mareCapacity } from '../farm/purchase';
import { assessForPlayer } from '../horse/playerView';
import { createRng } from '../rng';
import type { PlayerResult } from '../season/player';
import { yearEndCandidates, yearEndPending } from '../stud/yearEnd';
import {
  GRADE_ORDER,
  type GameDate,
  type GameEvent,
  type GameState,
  type Grade,
  type Horse,
  type HorseId,
  type Mare,
  type Money,
  type SaleEventDef,
  type SaleKind,
  type SellProposal,
  type Stallion,
  type WeekContext,
  type WeeklySystem,
} from '../types';
import { meanAbility, ratingFromAbility } from '../world/rating';
import { fitsKind } from './catalogue';
import { consignToSale, upcomingSales, type ConsignError } from './player';
import { announceWeekOf, type SalesStaticData } from './system';
import { valueLot } from './valuation';

export type RemoveProposalError = 'no_proposal';
export type ConsignProposalError = RemoveProposalError | ConsignError;

/** 위탁 실패 시 제안에 남기는 사유(한국어 한 줄) */
const CONSIGN_FAIL_NOTE: Readonly<Record<ConsignError, string>> = {
  sale_not_found: '세일 정보가 없어 빠짐',
  not_found: '말이 없어 빠짐',
  not_player_horse: '플레이어 말이 아니어서 빠짐',
  wrong_kind: '세일 종류가 맞지 않아 빠짐',
  too_late: '위탁 마감이 지나 빠짐',
  already_consigned: '이미 다른 위탁에 묶여 빠짐',
  invalid_reserve: '유보가가 올바르지 않아 빠짐',
};

/** 한 세일의 후보 한 두(정렬·보존 판정용 캐시) */
interface Candidate {
  horse: Horse;
  grade: Grade;
  poor: boolean;
}

function fail<E extends string>(error: E): { ok: false; error: E } {
  return { ok: false, error };
}

function byId(a: Horse, b: Horse): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** 제안 생성 창: 위탁 마감(발표 주) 전 AUTO_SELL_PROPOSE_WEEKS_BEFORE 주 ~ 마감 전 주 */
function inProposeWindow(event: SaleEventDef, week: number): boolean {
  const announce = announceWeekOf(event);
  return week >= announce - AUTO_SELL_PROPOSE_WEEKS_BEFORE && week < announce;
}

/** 말의 종합 평가 등급(플레이어에게 보이는 단서). 난수는 평가 전용 스트림을 쓴다 */
function gradeOf(state: GameState, horse: Horse): Grade {
  return assessForPlayer(state, horse.id).conformation.overall;
}

function gradeIndex(grade: Grade): number {
  return GRADE_ORDER.indexOf(grade);
}

/** 성적 부진: 출주가 기준 이상이고 무승 */
function isPoor(horse: Horse): boolean {
  return horse.record.starts >= AUTO_SELL_POOR_MIN_STARTS && horse.record.wins === 0;
}

/** 현역 정렬용 레이팅: 공식 레이팅(없으면 능력 환산, 조교 기록의 추정치와 같은 방식), 성적 부진이면 감점 */
function racingRating(horse: Horse): number {
  const base = horse.officialRating ?? ratingFromAbility(meanAbility(horse.ability));
  return isPoor(horse) ? base - AUTO_SELL_POOR_FORM_PENALTY : base;
}

/** 우수마 보존: 평가 상위, 그룹·블랙타입 입상, 공식 레이팅 상위, 우수 혈통(부 종부료 상위) 중 하나면 남긴다 */
function isProtected(state: GameState, horse: Horse, grade: Grade): boolean {
  if (AUTO_SELL_PROTECT_GRADES.includes(grade)) return true;
  if (horse.record.groupWins > 0 || horse.record.blackTypePlacings > 0) return true;
  if (horse.officialRating !== null && horse.officialRating >= AUTO_SELL_PROTECT_OR) return true;
  const sire: Stallion | undefined = horse.sireId === null ? undefined : state.stallions[horse.sireId];
  return sire !== undefined && sire.fee >= AUTO_SELL_PROTECT_SIRE_FEE;
}

/** 종류에 맞는 말인가(판매 종류별 대상 판정). 현역은 최소 나이, 번식 암말은 교배 예약·임신 중이면 제외 */
function sellableOf(state: GameState, horse: Horse, kind: SaleKind, year: number): boolean {
  if (!fitsKind(horse, kind, year)) return false;
  if (kind === 'horses_in_training' && year - horse.birthYear < AUTO_SELL_RACE_MIN_AGE) return false;
  if (kind === 'breeding_stock') {
    const mare: Mare | undefined = state.mares[horse.id];
    if (mare !== undefined && (mare.pregnant || mare.coveredBy !== null)) return false;
  }
  return true;
}

/** 이 말이 다른 세일·위탁·카탈로그·제안에 이미 묶였는가(같은 세일·연도의 것은 제외하지 않는다) */
function committedElsewhere(
  state: GameState,
  horseId: HorseId,
  saleId: string,
  year: number,
  taken: ReadonlySet<HorseId>,
): boolean {
  if (taken.has(horseId)) return true;
  if (state.sales.consignments.some((c) => c.horseId === horseId && !(c.saleId === saleId && c.year === year))) {
    return true;
  }
  if (
    state.sales.catalogues.some(
      (cat) =>
        cat.status === 'catalogued' &&
        !(cat.saleId === saleId && cat.year === year) &&
        cat.lots.some((lot) => lot.horseId === horseId && lot.result === null),
    )
  ) {
    return true;
  }
  return (state.sales.sellProposals ?? []).some(
    (p) =>
      p.horseId === horseId &&
      (p.status === 'proposed' || p.status === 'consigned') &&
      !(p.saleId === saleId && p.year === year),
  );
}

/** 판매 대상 집단(남길 두수를 셀 대상). 플레이어 말 중 종류의 집단에 속하고 다른 데 묶이지 않은 말 */
function groupOf(
  state: GameState,
  kind: SaleKind,
  saleId: string,
  year: number,
  taken: ReadonlySet<HorseId>,
  yearEndOut: ReadonlySet<HorseId>,
): Horse[] {
  return Object.values(state.horses)
    .filter((horse) => horse.ownerId === state.playerOwnerId)
    .filter((horse) => {
      switch (kind) {
        case 'horses_in_training':
          return horse.status === 'in_training' || horse.status === 'resting';
        case 'breeding_stock':
          return horse.sex === 'female' && horse.status === 'broodmare';
        default:
          return fitsKind(horse, kind, year);
      }
    })
    .filter((horse) => !yearEndOut.has(horse.id) && !committedElsewhere(state, horse.id, saleId, year, taken))
    .sort(byId);
}

/**
 * 이 세일에서 남길 두수 기준으로 낼 수 있는 상한(집단 두수 기준).
 * 1세·2세: 집단의 하위 비율(빚이면 높임), 현역: 집단 − 핵심 두수(빚이면 IN_DEBT), 번식 암말: 집단 − 목장 수용 두수.
 */
function quotaOf(state: GameState, kind: SaleKind, size: number, debt: boolean): number {
  switch (kind) {
    case 'yearling':
    case 'breeze_up':
      return Math.floor(size * (debt ? AUTO_SELL_YOUNG_BOTTOM_SHARE_IN_DEBT : AUTO_SELL_YOUNG_BOTTOM_SHARE));
    case 'horses_in_training':
      return Math.max(0, size - (debt ? AUTO_SELL_KEEP_RACERS_IN_DEBT : AUTO_SELL_KEEP_RACERS));
    case 'breeding_stock':
      return Math.max(0, size - mareCapacity(state));
    default:
      return 0;
  }
}

/** 하위부터(먼저 낼 말이 앞으로) 정렬. 현역은 레이팅, 나머지는 평가 등급이 기준이고 같으면 말 ID 순 */
function worstFirst(kind: SaleKind): (a: Candidate, b: Candidate) => number {
  return (a, b) => {
    if (kind === 'horses_in_training') {
      const ra = racingRating(a.horse);
      const rb = racingRating(b.horse);
      if (ra !== rb) return ra - rb;
    }
    const ga = gradeIndex(a.grade);
    const gb = gradeIndex(b.grade);
    if (ga !== gb) return gb - ga;
    return a.horse.id < b.horse.id ? -1 : a.horse.id > b.horse.id ? 1 : 0;
  };
}

function reasonLabel(kind: SaleKind): string {
  switch (kind) {
    case 'yearling':
      return '1세 하위';
    case 'breeze_up':
      return '2세 하위';
    case 'horses_in_training':
      return '현역 두수 초과';
    case 'breeding_stock':
      return '번식마 수용 초과';
    case 'foal':
      return '망아지 하위';
  }
}

/** 이유 한 줄(한국어): 예 '1세 하위 · 평가 C · 빚 상환' */
function noteOf(kind: SaleKind, pick: Candidate, debt: boolean): string {
  const parts = [reasonLabel(kind), `평가 ${pick.grade}`];
  if (debt) parts.push('빚 상환');
  if (pick.poor && kind === 'horses_in_training') parts.push('성적 부진');
  return parts.join(' · ');
}

/** 유보가 = 가치 추정 × AUTO_SELL_RESERVE_RATIO(SALE_VALUE_ROUND 단위). 가치 추정은 말·해마다 정한 독립 스트림 */
function reserveOf(state: GameState, horse: Horse, kind: SaleKind, year: number): Money {
  const rng = createRng(`${state.initialSeed}:auto-sell:${horse.id}:${year}`);
  const value = valueLot(state, horse, kind, year, rng);
  return Math.round((value * AUTO_SELL_RESERVE_RATIO) / SALE_VALUE_ROUND) * SALE_VALUE_ROUND;
}

/** 한 세일에서 새로 제안할 말(하위부터, 상한까지). 이미 제안·위탁·뺀 말은 세지만 다시 고르지 않는다 */
function pickForSale(
  state: GameState,
  event: SaleEventDef,
  year: number,
  existing: readonly SellProposal[],
  taken: ReadonlySet<HorseId>,
  yearEndOut: ReadonlySet<HorseId>,
): Candidate[] {
  const debt = state.economy.debt > 0;
  const group = groupOf(state, event.kind, event.id, year, taken, yearEndOut);
  const sameSale = existing.filter((p) => p.saleId === event.id && p.year === year);
  const sellerIds = new Set(sameSale.filter((p) => p.status !== 'skipped').map((p) => p.horseId));
  const skippedIds = new Set(sameSale.filter((p) => p.status === 'skipped').map((p) => p.horseId));
  // 이미 낸 제안과 플레이어가 뺀 말은 상한을 차지한다(뺀 말을 다른 말로 채우지 않는다)
  const claimed = group.filter((h) => sellerIds.has(h.id) || skippedIds.has(h.id)).length;
  const need = Math.max(0, quotaOf(state, event.kind, group.length, debt) - claimed);
  if (need === 0) return [];

  const pool: Candidate[] = [];
  for (const horse of group) {
    if (sellerIds.has(horse.id) || skippedIds.has(horse.id)) continue;
    if (!sellableOf(state, horse, event.kind, year)) continue;
    const grade = gradeOf(state, horse);
    if (isProtected(state, horse, grade)) continue;
    pool.push({ horse, grade, poor: isPoor(horse) });
  }
  pool.sort(worstFirst(event.kind));
  return pool.slice(0, need);
}

/**
 * 판매 제안 목록. 위탁 마감 AUTO_SELL_PROPOSE_WEEKS_BEFORE 주 전부터 마감 전 주까지 열리는 올해 세일(상태 upcoming)마다
 * 그 세일 종류의 플레이어 말을 하위부터 고른다. 새로 낸 제안만 돌려준다(기존 목록에 붙이는 일은 호출자 몫).
 * 제외: 이미 위탁·제안된 말, 다른 세일에 묶인 말, 같은 세일에서 뺀 말, 종마·핵심 번식 암말(목장 수용 안),
 * 연말 정산 대기 말(정산 전이면), 우수마(평가 상위·입상·OR·우수 혈통). 망아지 세일은 대상이 아니다.
 * 같은 상태 → 같은 결과. 입력 state 는 바꾸지 않는다.
 */
export function proposeSales(state: GameState, data: SalesStaticData): SellProposal[] {
  const now = state.date;
  const upcoming = upcomingSales(state, data).filter(
    (u) => u.year === now.year && u.status === 'upcoming' && u.event.kind !== 'foal' && inProposeWindow(u.event, now.week),
  );
  if (upcoming.length === 0) return [];

  const existing = state.sales.sellProposals ?? [];
  let budget = AUTO_SELL_MAX_PER_YEAR - existing.filter((p) => p.year === now.year).length;
  const yearEndOut = yearEndPending(state)
    ? new Set(yearEndCandidates(state).map((c) => c.horseId))
    : new Set<HorseId>();
  const taken = new Set<HorseId>();
  const out: SellProposal[] = [];
  for (const { event, year } of upcoming) {
    if (budget <= 0) break;
    const picks = pickForSale(state, event, year, existing, taken, yearEndOut).slice(0, budget);
    const debt = state.economy.debt > 0;
    for (const pick of picks) {
      taken.add(pick.horse.id);
      out.push({
        horseId: pick.horse.id,
        saleId: event.id,
        year,
        reserve: reserveOf(state, pick.horse, event.kind, year),
        note: noteOf(event.kind, pick, debt),
        status: 'proposed',
      });
    }
    budget -= picks.length;
  }
  return out;
}

function proposalIndex(list: readonly SellProposal[] | undefined, horseId: HorseId): number {
  return (list ?? []).findIndex((p) => p.horseId === horseId && p.status === 'proposed');
}

/** 판매 제안을 뺀다(이번 세일 제외). 상태 skipped, 기록은 남아 같은 세일에 다시 제안되지 않는다 */
export function removeSellProposal(state: GameState, horseId: HorseId): PlayerResult<RemoveProposalError> {
  const index = proposalIndex(state.sales.sellProposals, horseId);
  if (index < 0) return fail('no_proposal');
  const next = structuredClone(state);
  const item = next.sales.sellProposals?.[index];
  if (item === undefined) return fail('no_proposal');
  item.status = 'skipped';
  item.note = '플레이어가 뺌';
  return { ok: true, state: next, events: [] };
}

/** 제안을 지금 위탁한다(consignToSale). 성공하면 consigned, 실패하면 그 오류를 그대로 돌려준다(원본 불변) */
export function consignProposal(
  state: GameState,
  horseId: HorseId,
  data: SalesStaticData,
): PlayerResult<ConsignProposalError> {
  const index = proposalIndex(state.sales.sellProposals, horseId);
  const proposal = state.sales.sellProposals?.[index];
  if (index < 0 || proposal === undefined) return fail('no_proposal');
  const result = consignToSale(state, horseId, proposal.saleId, proposal.reserve, data);
  if (!result.ok) return result;
  const next = result.state;
  const item = next.sales.sellProposals?.[index];
  if (item !== undefined) item.status = 'consigned';
  return { ok: true, state: next, events: [] };
}

/** 판매 제안 자동 위탁 설정(settings.autoSell). 오류는 없다 */
export function setAutoSell(state: GameState, enabled: boolean): PlayerResult<never> {
  const next = structuredClone(state);
  next.settings = { ...next.settings, autoSell: enabled };
  return { ok: true, state: next, events: [] };
}

/** 마감이 지난 제안 정리: 지난 연도 제안은 지우고, 이번 해 마감이 지난 proposed 는 skipped 로 바꾼다 */
function settleOldProposals(
  draft: GameState,
  now: GameDate,
  eventById: ReadonlyMap<string, SaleEventDef>,
): void {
  const list = draft.sales.sellProposals;
  if (list === undefined || list.length === 0) return;
  const kept = list.filter((p) => p.year >= now.year);
  for (const p of kept) {
    if (p.status !== 'proposed') continue;
    const event = eventById.get(p.saleId);
    if (event === undefined) {
      p.status = 'skipped';
      p.note = '세일 정보가 없어 빠짐';
    } else if (announceWeekOf(event) <= now.week) {
      p.status = 'skipped';
      p.note = '위탁 마감이 지나 빠짐';
    }
  }
  if (kept.length !== list.length) draft.sales.sellProposals = kept;
}

/** 마감 직전 주(발표 주 − 1)에 남은 proposed 를 위탁한다. 실패하면 skipped 와 사유 */
function consignDue(
  draft: GameState,
  now: GameDate,
  eventById: ReadonlyMap<string, SaleEventDef>,
  data: SalesStaticData,
): void {
  const list = draft.sales.sellProposals;
  if (list === undefined) return;
  for (const p of list) {
    if (p.status !== 'proposed' || p.year !== now.year) continue;
    const event = eventById.get(p.saleId);
    if (event === undefined || announceWeekOf(event) - 1 !== now.week) continue;
    const result = consignToSale(draft, p.horseId, p.saleId, p.reserve, data);
    if (result.ok) {
      draft.sales.consignments = result.state.sales.consignments;
      p.status = 'consigned';
    } else {
      p.status = 'skipped';
      p.note = CONSIGN_FAIL_NOTE[result.error];
    }
  }
}

/**
 * 판매 담당 주간 시스템(id 'auto_sell'). 세일 시스템 앞에서 돈다.
 * (a) 정리 (b) 제안 생성 — 창 안이면 새 제안을 내고 sell_proposals_ready (c) 자동 위탁 — settings.autoSell !== false 면 마감 직전 주.
 * 난수는 ctx.rng 를 쓰지 않는다(유보가 스트림은 말·해마다 따로 정한다).
 */
export function createAutoSellSystem(data: SalesStaticData): WeeklySystem {
  const eventById = new Map<string, SaleEventDef>((data.sales?.events ?? []).map((e) => [e.id, e] as const));
  return {
    id: 'auto_sell',
    run(draft: GameState, ctx: WeekContext): GameEvent[] {
      if (data.sales === undefined) return [];
      const now: GameDate = { year: ctx.date.year, week: ctx.date.week };
      const events: GameEvent[] = [];
      settleOldProposals(draft, now, eventById);
      const created = proposeSales(draft, data);
      if (created.length > 0) {
        draft.sales.sellProposals = [...(draft.sales.sellProposals ?? []), ...created];
        events.push({ type: 'sell_proposals_ready', count: created.length, date: { ...now } });
      }
      if (draft.settings.autoSell !== false) consignDue(draft, now, eventById, data);
      return events;
    },
  };
}
