import { bookingSeasonOf, rollBookingSeason } from '../breeding/season';
import { PHASE_WINDOWS, WEEKS_PER_YEAR } from '../config/game';
import * as config from '../config/stud';
import { recordMoney } from '../economy/ledger';
import { createRng } from '../rng';
import type { GameDate, GameEvent, GameState, HorseId, WeeklySystem } from '../types';

/** 인기에 따른 기본 수요 비율(북 대비). 인기 30 → 0.65, 90 → 1.3 선형, [MIN, MAX] 로 자름 */
export function baseDemandRatio(popularity: number): number {
  const linear = config.BOOK_DEMAND_RATIO_AT_POP30
    + (popularity - 30) / (90 - 30)
    * (config.BOOK_DEMAND_RATIO_AT_POP90 - config.BOOK_DEMAND_RATIO_AT_POP30);
  return Math.max(config.BOOK_DEMAND_RATIO_MIN, Math.min(config.BOOK_DEMAND_RATIO_MAX, linear));
}

/** 종마·시즌별 독립 스트림으로 가상 외부 예약 수요를 계산한다. */
export function seasonDemand(state: GameState, stallionId: HorseId, season: number): number {
  const stallion = state.stallions[stallionId]!;
  const horse = state.horses[stallionId]!;
  const ratio = baseDemandRatio(stallion.popularity);
  const freshman = season - stallion.firstSeasonYear < config.BOOK_FRESHMAN_SEASONS
    ? config.BOOK_FRESHMAN_MULT : 1;
  const old = season - horse.birthYear >= config.BOOK_OLD_AGE ? config.BOOK_OLD_MULT : 1;
  const rng = createRng(`${state.initialSeed}:book-demand:${stallionId}:${season}`);
  return Math.round(stallion.bookLimit * ratio * freshman * old
    * Math.exp(rng.normal(0, config.BOOK_DEMAND_NOISE_SD)));
}

/** 시작 주를 포함해 연도를 넘는 예약 창의 주간 진행률을 계산한다. */
export function accrualProgress(date: GameDate, season: number): number {
  const elapsed = (date.year - (season - 1)) * WEEKS_PER_YEAR
    + date.week - config.BOOKING_OPEN_WEEK + 1;
  const total = WEEKS_PER_YEAR - config.BOOKING_OPEN_WEEK + 1 + config.BOOK_ACCRUAL_END_WEEK;
  return Math.max(0, Math.min(1, elapsed / total));
}

export function createStudBooksSystem(): WeeklySystem {
  const settlementWeek = Math.max(...PHASE_WINDOWS.breeding.map((w) => w.endWeek)) + 1;
  return {
    id: 'stud_books',
    run(state, { date }): GameEvent[] {
      const events: GameEvent[] = [];
      const season = bookingSeasonOf(date);
      for (const id of Object.keys(state.stallions).sort()) {
        const stallion = state.stallions[id]!;
        const horse = state.horses[id];
        if (horse?.status !== 'stud') continue;
        const playerPrivate = stallion.privateTo === state.playerOwnerId;
        if (playerPrivate) {
          stallion.bookedThisSeason -= stallion.aiBooked;
          stallion.aiDemand = 0;
          stallion.aiBooked = 0;
        }
        if (season !== null && season >= stallion.firstSeasonYear) {
          rollBookingSeason(stallion, season);
          if (stallion.leasedAwayUntil != null && season < stallion.leasedAwayUntil) continue;
          if (!playerPrivate && stallion.aiDemand === 0) {
            const demand = seasonDemand(state, id, season);
            stallion.aiDemand = stallion.privateTo != null
              ? Math.max(1, Math.floor(demand * config.PRIVATE_DEMAND_SHARE)) : Math.max(1, demand);
          }
          const progress = accrualProgress(date, season);
          const target = Math.floor(stallion.aiDemand * (1 - (1 - progress) ** config.BOOK_ACCRUAL_SHAPE));
          const playerBooked = stallion.bookedThisSeason - stallion.aiBooked;
          const newAi = Math.min(target, Math.max(0, stallion.bookLimit - playerBooked));
          stallion.aiBooked = Math.max(stallion.aiBooked, newAi);
          stallion.bookedThisSeason = stallion.aiBooked + playerBooked;
        }
        const owned = horse.ownerId === state.playerOwnerId;
        const soldDomestic = horse.ownerId === null && state.stud.sales.some((sale) =>
          sale.stallionId === id && sale.mode === 'domestic');
        if (date.week !== settlementWeek || (!owned && !soldDomestic)
          || (stallion.leasedAwayUntil != null && date.year < stallion.leasedAwayUntil)
          || stallion.bookingSeason !== date.year
          || state.stud.seasons.some((record) => record.stallionId === id && record.year === date.year)) continue;
        const rng = createRng(`${state.initialSeed}:stud-settle:${id}:${date.year}`);
        let conceptions = 0;
        for (let i = 0; i < stallion.aiBooked; i++) {
          if (rng.chance(stallion.fertility)) conceptions++;
        }
        const income = owned ? conceptions * stallion.fee : 0;
        if (income > 0) recordMoney(state, state.playerOwnerId, 'stud_fee_received', income, date, id);
        state.stud.seasons.push({ stallionId: id, year: date.year, fee: stallion.fee,
          outsideCovers: stallion.aiBooked, ownCovers: stallion.bookedThisSeason - stallion.aiBooked,
          conceptions, income });
        state.stud.seasons = state.stud.seasons.slice(-config.STUD_SEASON_HISTORY_LIMIT);
        if (owned) events.push({ type: 'stud_season_settled', stallionId: id, year: date.year,
          outsideCovers: stallion.aiBooked, conceptions, income, date: { ...date } });
      }
      return events;
    },
  };
}
