import { bookingSeasonOf } from '../../engine/breeding/season';
import { freeStudSlots } from '../../engine/stud/stand';
import { isInPhase } from '../../engine/time/calendar';
import type { GameState, HorseId, Mare, Stallion } from '../../engine/types';
import { feeKo } from '../game/text';

/** 종마사에 종마가 없을 때 보이는 문구 */
export const STUD_EMPTY_KO = '아직 종마가 없습니다. 연말 정산에서 은퇴하는 수말을 종마로 세울 수 있습니다.';

/** 정산 기록 표시 최대 건수(최신순) */
const SEASON_ROWS_LIMIT = 10;

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
}

function compareText(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
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
      return [{
        horseId: horse.id,
        name: horse.name,
        feeKo: feeKo(stallion.fee),
        bookKo: bookStatusOf(state, stallion).labelKo,
        firstSeasonYear: stallion.firstSeasonYear,
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

  return { slotsKo: `종마사 ${used}/${state.stud.slots}칸 사용`, stallions, seasons };
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
