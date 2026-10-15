import * as config from '../config/stud';
import { recordMoney } from '../economy/ledger';
import type {
  BreederId, CountryCode, GameDate, GameEvent, GameState, HorseId, Money,
  StallionSaleMode, StudLease, WeeklySystem,
} from '../types';
import { buildStallionRecord } from './stand';
import { estimateStudFee } from './value';

export type TradeError = 'not_found' | 'not_player_stallion' | 'outside_deal_window'
  | 'leased' | 'invalid_nominations' | 'already_leased' | 'invalid_return_season';

type TradeResult = { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: TradeError };

function roundDealMoney(value: number): Money {
  return Math.max(0, Math.round(value / config.STUD_DEAL_MONEY_STEP) * config.STUD_DEAL_MONEY_STEP);
}

export function saleAgeMultiplier(age: number): number {
  return age <= config.STALLION_SALE_FULL_AGE ? 1 : Math.max(config.STALLION_SALE_AGE_FLOOR,
    1 - config.STALLION_SALE_AGE_DECAY * (age - config.STALLION_SALE_FULL_AGE));
}

export function stallionSalePrice(
  fee: Money, age: number, mode: StallionSaleMode, nominations: number,
): Money {
  const base = fee * config.STALLION_SALE_FEE_MULT * saleAgeMultiplier(age);
  return roundDealMoney(mode === 'domestic'
    ? base - nominations * fee * config.NOMINATION_PRICE_FEE_MULT
    : base * config.STALLION_SALE_OVERSEAS_MULT);
}

/** 화면 견적은 상태와 난수를 변경하지 않는다. */
export function salePriceQuote(state: GameState, horseId: HorseId): {
  fee: Money; domestic: Money; overseas: Money; nominationCost: Money;
} | null {
  const horse = state.horses[horseId];
  if (horse === undefined || horse.ownerId !== state.playerOwnerId) return null;
  let fee: Money;
  if (horse.status === 'stud') {
    const stallion = state.stallions[horseId];
    if (stallion === undefined) return null;
    fee = stallion.fee;
  } else if ((horse.status === 'in_training' || horse.status === 'resting')
    && horse.sex === 'male' && !horse.gelded) {
    fee = estimateStudFee(state, horseId).fee;
  } else return null;
  const age = state.date.year - horse.birthYear;
  return { fee, domestic: stallionSalePrice(fee, age, 'domestic', 0),
    overseas: stallionSalePrice(fee, age, 'overseas', 0),
    nominationCost: fee * config.NOMINATION_PRICE_FEE_MULT };
}

/** 같은 나라를 우선하고, 규모·ID 순으로 구매자를 결정한다. */
export function domesticBuyer(state: GameState, country: CountryCode): BreederId | null {
  const all = Object.values(state.breeders);
  const local = all.filter((breeder) => breeder.country === country);
  const scales = ['large', 'medium', 'small'];
  return (local.length > 0 ? local : all).sort((a, b) =>
    scales.indexOf(a.scale) - scales.indexOf(b.scale)
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0]?.id ?? null;
}

/** 호출자가 검증한 판매를 복제본에 적용한다. */
export function applyStallionSale(
  draft: GameState, horseId: HorseId, mode: StallionSaleMode, nominations: number, date: GameDate,
): GameEvent[] {
  const horse = draft.horses[horseId];
  const owner = draft.owners[draft.playerOwnerId];
  if (horse === undefined || owner === undefined) throw new Error('applyStallionSale: 필수 레코드 없음');
  const fee = draft.stallions[horseId]?.fee ?? estimateStudFee(draft, horseId).fee;
  const price = stallionSalePrice(fee, date.year - horse.birthYear, mode, nominations);
  if (mode === 'domestic' && draft.stallions[horseId] === undefined) {
    draft.stallions[horseId] = buildStallionRecord(draft, horseId, date.year, owner.country);
  }
  const from = horse.status;
  horse.status = mode === 'domestic' ? 'stud' : 'retired';
  horse.ownerId = null;
  horse.trainerId = null;
  owner.horseIds = owner.horseIds.filter((id) => id !== horseId);
  for (const meeting of draft.seasonState.meetings) {
    for (const race of meeting.races) {
      if (race.status === 'open') {
        race.declarations = race.declarations.filter((d) => !(d.isPlayer && d.horseId === horseId));
      }
    }
  }
  if (mode === 'domestic' && nominations > 0) {
    draft.stud.nominations.push({ stallionId: horseId, perSeason: nominations, season: 0, used: 0 });
  }
  recordMoney(draft, draft.playerOwnerId, 'stallion_sale', price, date, horseId);
  draft.stud.sales.push({ stallionId: horseId, year: date.year, mode, price,
    buyerId: mode === 'domestic' ? domesticBuyer(draft, owner.country) : null, nominations });
  draft.stud.sales = draft.stud.sales.slice(-config.STALLION_SALE_HISTORY_LIMIT);
  return [
    { type: 'horse_status_changed', horseId, from, to: horse.status, date },
    { type: 'stallion_sold', horseId, mode, price, nominations, date },
  ];
}

function dealError(state: GameState, horseId: HorseId): TradeError | null {
  const horse = state.horses[horseId];
  if (horse === undefined) return 'not_found';
  if (horse.ownerId !== state.playerOwnerId || horse.status !== 'stud'
    || state.stallions[horseId] === undefined) return 'not_player_stallion';
  if (state.date.week < config.STUD_DEAL_FIRST_WEEK
    || state.date.week > config.STUD_DEAL_LAST_WEEK) return 'outside_deal_window';
  return null;
}

export function sellStallion(
  state: GameState, horseId: HorseId, mode: StallionSaleMode, nominations: number,
): TradeResult {
  const error = dealError(state, horseId);
  if (error !== null) return { ok: false, error };
  if (state.stud.leases.some((lease) => lease.stallionId === horseId)) return { ok: false, error: 'leased' };
  if (!Number.isInteger(nominations) || nominations < 0
    || nominations > config.NOMINATION_MAX_PER_SEASON || (mode === 'overseas' && nominations > 0)) {
    return { ok: false, error: 'invalid_nominations' };
  }
  const draft = structuredClone(state);
  const events = applyStallionSale(draft, horseId, mode, nominations, { ...state.date });
  return { ok: true, state: draft, events };
}

export function leaseStallion(
  state: GameState, horseId: HorseId, kind: StudLease['kind'], returnSeason?: number,
): TradeResult {
  const error = dealError(state, horseId);
  if (error !== null) return { ok: false, error };
  if (state.stud.leases.some((lease) => lease.stallionId === horseId)) {
    return { ok: false, error: 'already_leased' };
  }
  const year = state.date.year;
  if (kind === 'long' && (returnSeason === undefined || !Number.isInteger(returnSeason)
    || returnSeason < year + 2 || returnSeason > year + 1 + config.LONG_LEASE_MAX_SEASONS)) {
    return { ok: false, error: 'invalid_return_season' };
  }
  const draft = structuredClone(state);
  const stallion = draft.stallions[horseId]!;
  const returns = kind === 'shuttle' ? year + 1 : returnSeason!;
  const rent = roundDealMoney(stallion.fee * (kind === 'shuttle'
    ? config.SHUTTLE_RENT_FEE_MULT : config.LONG_LEASE_RENT_FEE_MULT));
  draft.stud.leases.push({ stallionId: horseId, kind, year, returnSeason: returns, rent, paidSeasons: 0 });
  if (kind === 'long') stallion.leasedAwayUntil = returns;
  return { ok: true, state: draft, events: [{ type: 'stallion_leased', horseId, kind,
    returnSeason: returns, rent, date: { ...state.date } }] };
}

/** 임대 배열 순서대로 정산하며 공용 난수를 소비하지 않는다. */
export function createStudLeaseSystem(): WeeklySystem {
  return {
    id: 'stud_leases',
    run(draft, { date }) {
      const events: GameEvent[] = [];
      draft.stud.leases = draft.stud.leases.filter((lease) => {
        const horse = draft.horses[lease.stallionId];
        const active = horse?.status === 'stud' && horse.ownerId === draft.playerOwnerId;
        const stallion = draft.stallions[lease.stallionId];
        if (lease.kind === 'long' && !active) {
          if (stallion !== undefined) stallion.leasedAwayUntil = null;
          return false;
        }
        const due = lease.kind === 'shuttle'
          ? date.week === config.SHUTTLE_RENT_PAY_WEEK && date.year === lease.year
          : date.week === config.LONG_LEASE_PAY_WEEK
            && date.year >= lease.year + 1 && date.year < lease.returnSeason;
        if (!due) return true;
        const returned = lease.kind === 'shuttle' || date.year === lease.returnSeason - 1;
        if (active) {
          recordMoney(draft, draft.playerOwnerId, 'stud_lease', lease.rent, date, lease.stallionId);
          lease.paidSeasons += 1;
          events.push({ type: 'stud_lease_paid', horseId: lease.stallionId,
            kind: lease.kind, rent: lease.rent, returned, date: { ...date } });
        }
        if (returned && lease.kind === 'long' && stallion !== undefined) stallion.leasedAwayUntil = null;
        return !returned;
      });
      return events;
    },
  };
}
