import { bookingSeasonOf, nominationsLeft } from '../../engine/breeding/season';
import {
  FERTILITY_MIN_SAMPLE,
  FERTILITY_RETIRE_RATE,
  FERTILITY_RETIRE_SEASONS,
  LONG_LEASE_RENT_FEE_MULT,
  NOMINATION_MAX_PER_SEASON,
  PRIVATE_RELATION_MIN,
  SHUTTLE_RENT_FEE_MULT,
  STUD_DEAL_FIRST_WEEK,
  STUD_DEAL_LAST_WEEK,
  STUD_DEAL_MONEY_STEP,
} from '../../engine/config/stud';
import { publicFertility, type RetirePlayerError } from '../../engine/stud/fertility';
import { privateAccess, setStallionPrivate } from '../../engine/stud/private';
import { freeStudSlots } from '../../engine/stud/stand';
import { salePriceQuote, type TradeError } from '../../engine/stud/trade';
import { isInPhase } from '../../engine/time/calendar';
import type { GameState, HorseId, Mare, Stallion } from '../../engine/types';
import { feeKo } from '../game/text';

/** 종마사에 종마가 없을 때 보이는 문구 */
export const STUD_EMPTY_KO = '아직 종마가 없습니다. 연말 정산에서 은퇴하는 수말을 종마로 세울 수 있습니다.';

/** 정산 기록 표시 최대 건수(최신순) */
const SEASON_ROWS_LIMIT = 10;
/** 판매 기록 표시 최대 건수(최신순) */
const SALE_ROWS_LIMIT = 10;

/** 종마 북 현황 */
export interface BookStatus {
  season: number | null;
  booked: number;
  limit: number;
  full: boolean;
  labelKo: string;
}

/** 지금 교배 예약이 직접 교배(번식 주 안, 같은 시즌)인지. 아니면 사전 예약이다. */
function isDirectCovering(state: GameState, season: number): boolean {
  return season === state.date.year && isInPhase(state.date.week, 'breeding');
}

/** 종마 한 두의 북 현황. 예약 집계 시즌이 현재 예약 시즌과 다르면 예약 0두로 본다. */
export function bookStatusOf(state: GameState, stallion: Stallion): BookStatus {
  const season = bookingSeasonOf(state.date);
  const booked = season !== null && stallion.bookingSeason === season ? stallion.bookedThisSeason : 0;
  const limit = stallion.bookLimit;
  const full = booked >= limit;
  let labelKo: string;
  if (season === null) {
    labelKo = '예약 창 닫힘(11월에 열림)';
  } else if (full) {
    labelKo = `${season} 시즌 북 마감`;
  } else {
    labelKo = `${season} 시즌 북 ${booked}/${limit}`;
  }
  return { season, booked, limit, full, labelKo };
}

/** 예약 창 안내 한 줄 */
export function bookingWindowKo(state: GameState): string {
  const season = bookingSeasonOf(state.date);
  if (season === null) {
    return '예약 창이 닫혀 있습니다. 11월 첫 주에 다음 시즌 예약이 열립니다.';
  }
  const base = `지금 예약하면 ${season} 시즌 교배입니다`;
  return isDirectCovering(state, season)
    ? base
    : `${base} — 번식 시즌에 교배가 이루어지며, 교배하지 못하면 시즌 끝에 환불됩니다`;
}

/** 플레이어 종마 한 두의 표시 행 */
export interface MyStudStallionRow {
  horseId: HorseId;
  name: string;
  feeKo: string;
  bookKo: string;
  firstSeasonYear: number;
  /** 임대 중이면 '셔틀 임대 중(N 시즌 복귀)' 또는 '장기 임대 중(N 시즌 복귀)', 아니면 null */
  leaseKo: string | null;
  /** 교배권 0개 기준 판매가(국내·해외). 견적이 없으면 null */
  salePrice: { domesticKo: string; overseasKo: string } | null;
  /** 거래 창 안이고 임대 중이 아니면 true */
  canDeal: boolean;
  /** 비공개 종마(privateTo 가 내 마주)면 true */
  isPrivate: boolean;
  /** 셔틀 임대료(한 번) */
  shuttleRentKo: string;
  /** 장기 임대료(연간, '/년' 포함) */
  longRentKo: string;
  /** 공개 수태율 문구(fertilityKo) */
  fertilityKo: string;
  /** 마지막 FERTILITY_RETIRE_SEASONS 개 기록이 모두 표본 충분 + 수태율 미달이면 true(저수태 경고) */
  fertilityWarning: boolean;
  /** 은퇴 가능 여부. canDeal 과 같은 조건(거래 창 안·임대 아님) */
  canRetire: boolean;
}

/** 남긴 교배권 한 줄(판매한 종마 포함) */
export interface NominationRow {
  name: string;
  leftKo: string;
}

/** 종마 판매 기록 한 줄 */
export interface SoldRow {
  year: number;
  name: string;
  modeKo: '국내' | '해외';
  priceKo: string;
}

/** 플레이어 정산 기록 한 행 */
export interface MyStudSeasonRow {
  year: number;
  name: string;
  outsideCovers: number;
  conceptions: number;
  incomeKo: string;
}

/** 내 종마 화면 데이터 */
export interface MyStudView {
  slotsKo: string;
  stallions: MyStudStallionRow[];
  seasons: MyStudSeasonRow[];
  /** 거래 창 안내 한 줄 */
  dealWindowKo: string;
  /** 판매하며 남긴 교배권(종마 이름과 이번 예약 시즌 남은 수) */
  nominations: NominationRow[];
  /** 종마 판매 기록(최신순, 최대 10건) */
  soldRows: SoldRow[];
}

function compareText(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** 천 유로 단위 반올림(엔진 거래 가격과 같은 단위) */
function roundDealMoney(value: number): number {
  return Math.round(value / STUD_DEAL_MONEY_STEP) * STUD_DEAL_MONEY_STEP;
}

/** 거래 창(28~43주) 안인지 */
function dealWindowOpen(state: GameState): boolean {
  return state.date.week >= STUD_DEAL_FIRST_WEEK && state.date.week <= STUD_DEAL_LAST_WEEK;
}

/** 거래 창 안내 한 줄 */
function dealWindowTextKo(state: GameState): string {
  return dealWindowOpen(state)
    ? `종마 거래 가능(${STUD_DEAL_LAST_WEEK}주까지)`
    : `종마 판매·임대는 ${STUD_DEAL_FIRST_WEEK}~${STUD_DEAL_LAST_WEEK}주에만 할 수 있습니다`;
}

/** 수태율 소수(0~1)를 정수 퍼센트 문자열 숫자로 바꾼다 */
function percentOf(rate: number): number {
  return Math.round(rate * 100);
}

/** 공개 수태율 표시 문구. 기록이 없으면 '약 N%'(추정), 표본이 적으면 'L~H%'(구간), 충분하면 'N%'(정확). */
export function fertilityKo(stallion: Stallion): string {
  const value = publicFertility(stallion);
  switch (value.kind) {
    case 'none':
      return '—';
    case 'estimate':
      return `약 ${percentOf(value.rate)}%`;
    case 'range':
      return `${percentOf(value.low)}~${percentOf(value.high)}%`;
    case 'exact':
      return `${percentOf(value.rate)}%`;
  }
}

/** 마지막 FERTILITY_RETIRE_SEASONS 개 기록이 모두 교배 표본 충분 + 수태율 미달인지(저수태 경고) */
function fertilityWarningOf(stallion: Stallion): boolean {
  const recent = (stallion.fertilityHistory ?? []).slice(-FERTILITY_RETIRE_SEASONS);
  // 엔진 판정(stud/fertility.ts judgeRetirement)과 같게 연속 시즌만 본다
  return recent.length === FERTILITY_RETIRE_SEASONS
    && recent.every((season, i) => i === 0 || season.year === recent[i - 1]!.year + 1)
    && recent.every((season) =>
      season.covers >= FERTILITY_MIN_SAMPLE && season.conceptions / season.covers < FERTILITY_RETIRE_RATE);
}

/** 거래 오류 사유를 한국어 문구로 바꾼다 */
export function tradeErrorKo(error: TradeError): string {
  switch (error) {
    case 'not_found':
      return '말을 찾을 수 없습니다.';
    case 'not_player_stallion':
      return '내 종마만 판매하거나 임대할 수 있습니다.';
    case 'outside_deal_window':
      return `종마 판매·임대는 ${STUD_DEAL_FIRST_WEEK}~${STUD_DEAL_LAST_WEEK}주에만 할 수 있습니다.`;
    case 'leased':
      return '임대 중인 종마는 판매할 수 없습니다. 임대가 끝난 뒤 다시 시도하세요.';
    case 'invalid_nominations':
      return `교배권은 국내 판매에서만 0~${NOMINATION_MAX_PER_SEASON}개로 정할 수 있습니다.`;
    case 'already_leased':
      return '이미 임대 중인 종마입니다.';
    case 'invalid_return_season':
      return '장기 임대 복귀 시즌이 허용 범위를 벗어났습니다. 다시 고르세요.';
  }
}

/** 비공개 전환 오류 사유(엔진 setStallionPrivate 의 실패 사유) */
export type PrivateError = Extract<ReturnType<typeof setStallionPrivate>, { ok: false }>['error'];

/** 비공개 전환 오류 사유를 한국어 문구로 바꾼다 */
export function privateErrorKo(error: PrivateError): string {
  switch (error) {
    case 'not_found':
      return '말을 찾을 수 없습니다.';
    case 'not_player_stallion':
      return '내 종마만 비공개로 바꿀 수 있습니다.';
    case 'outside_deal_window':
      return `공개 여부는 ${STUD_DEAL_FIRST_WEEK}~${STUD_DEAL_LAST_WEEK}주에만 바꿀 수 있습니다.`;
    case 'leased':
      return '임대 중인 종마는 공개 여부를 바꿀 수 없습니다. 임대가 끝난 뒤 다시 시도하세요.';
    case 'no_change':
      return '이미 같은 공개 상태입니다.';
  }
}

/** 직접 은퇴 오류 사유를 한국어 문구로 바꾼다 */
export function retireErrorKo(error: RetirePlayerError): string {
  switch (error) {
    case 'not_found':
      return '말을 찾을 수 없습니다.';
    case 'not_player_stallion':
      return '내 종마만 은퇴시킬 수 있습니다.';
    case 'outside_deal_window':
      return `종마 은퇴는 ${STUD_DEAL_FIRST_WEEK}~${STUD_DEAL_LAST_WEEK}주에만 할 수 있습니다.`;
    case 'leased':
      return '임대 중인 종마는 은퇴시킬 수 없습니다. 임대가 끝난 뒤 다시 시도하세요.';
  }
}

/**
 * 종마 한 두의 비공개 표시 문구. 공개면 null.
 * 플레이어 비공개는 '비공개(내 암말 전용)', AI 비공개는 허가 여부에 따라 '비공개 — {마주} 허가' 또는 '비공개 — {마주}, 관계 N 이상 필요'.
 */
export function privateLabelKo(state: GameState, stallion: Stallion): string | null {
  const privateTo = stallion.privateTo;
  if (privateTo == null) return null;
  if (privateTo === state.playerOwnerId) return '비공개(내 암말 전용)';
  const owner = state.owners[privateTo];
  const name = owner?.studName ?? owner?.name ?? privateTo;
  return privateAccess(state, stallion.horseId, state.playerOwnerId) === 'denied'
    ? `비공개 — ${name}, 관계 ${PRIVATE_RELATION_MIN} 이상 필요`
    : `비공개 — ${name} 허가`;
}

/** 내 종마 화면: 플레이어 소유·status 'stud' 종마와 최근 정산 기록(최신순, 최대 10건) */
export function myStudView(state: GameState): MyStudView {
  const used = state.stud.slots - freeStudSlots(state);
  const nameOf = (id: HorseId): string => state.horses[id]?.name ?? id;

  const stallions: MyStudStallionRow[] = Object.values(state.horses)
    .filter((horse) => horse.ownerId === state.playerOwnerId && horse.status === 'stud')
    .flatMap((horse) => {
      const stallion = state.stallions[horse.id];
      if (stallion === undefined) return [];
      const lease = state.stud.leases.find((entry) => entry.stallionId === horse.id);
      const quote = salePriceQuote(state, horse.id);
      const canDeal = dealWindowOpen(state) && lease === undefined;
      return [{
        horseId: horse.id,
        name: horse.name,
        feeKo: feeKo(stallion.fee),
        bookKo: bookStatusOf(state, stallion).labelKo,
        firstSeasonYear: stallion.firstSeasonYear,
        leaseKo: lease === undefined ? null
          : `${lease.kind === 'shuttle' ? '셔틀 임대 중' : '장기 임대 중'}(${lease.returnSeason} 시즌 복귀)`,
        salePrice: quote === null ? null : { domesticKo: feeKo(quote.domestic), overseasKo: feeKo(quote.overseas) },
        canDeal,
        isPrivate: stallion.privateTo === state.playerOwnerId,
        shuttleRentKo: feeKo(roundDealMoney(stallion.fee * SHUTTLE_RENT_FEE_MULT)),
        longRentKo: `${feeKo(roundDealMoney(stallion.fee * LONG_LEASE_RENT_FEE_MULT))}/년`,
        fertilityKo: fertilityKo(stallion),
        fertilityWarning: fertilityWarningOf(stallion),
        canRetire: canDeal,
      }];
    })
    .sort((a, b) => compareText(a.name, b.name) || compareText(a.horseId, b.horseId));

  const seasons: MyStudSeasonRow[] = [...state.stud.seasons]
    .reverse()
    .slice(0, SEASON_ROWS_LIMIT)
    .map((record) => ({
      year: record.year,
      name: nameOf(record.stallionId),
      outsideCovers: record.outsideCovers,
      conceptions: record.conceptions,
      incomeKo: feeKo(record.income),
    }));

  const season = bookingSeasonOf(state.date) ?? state.date.year + 1;
  const nominations: NominationRow[] = state.stud.nominations.map((right) => ({
    name: nameOf(right.stallionId),
    leftKo: `이번 예약 시즌 남은 교배권 ${nominationsLeft(state, right.stallionId, season)}/${right.perSeason}`,
  }));

  const soldRows: SoldRow[] = [...state.stud.sales]
    .reverse()
    .slice(0, SALE_ROWS_LIMIT)
    .map((record) => ({
      year: record.year,
      name: nameOf(record.stallionId),
      modeKo: record.mode === 'domestic' ? '국내' : '해외',
      priceKo: feeKo(record.price),
    }));

  return {
    slotsKo: `종마사 ${used}/${state.stud.slots}칸 사용`,
    stallions,
    seasons,
    dealWindowKo: dealWindowTextKo(state),
    nominations,
    soldRows,
  };
}

/**
 * 번식 암말의 예약 표시. 사전 예약 중이면 '{종마} 사전 예약({season} 시즌)',
 * 교배 배정이면 '{종마} 교배 배정', 없으면 null.
 */
export function mareBookingKo(mare: Mare, nameOf: (id: HorseId) => string): string | null {
  if (mare.bookedFor != null) {
    return `${nameOf(mare.bookedFor.stallionId)} 사전 예약(${mare.bookedFor.season} 시즌)`;
  }
  if (mare.coveredBy !== null) {
    return `${nameOf(mare.coveredBy)} 교배 배정`;
  }
  return null;
}
