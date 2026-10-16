import { NH_REPUTATION_DEMAND_AMPLITUDE, NH_REPUTATION_NEUTRAL } from '../config/nh';
import * as config from '../config/stud';
import { TIER_FEE } from '../config/world';
import type { GameEvent, GameState, HorseId, Money, Stallion, WeeklySystem } from '../types';
import { baseDemandRatio } from './books';
import { roundStudFee } from './value';

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

/** 종부료에 가장 가까운 가격대(TIER_FEE 로그 거리, 동률은 번호 작은 쪽) */
function feeBand(fee: Money): number {
  let band = 1;
  let best = Infinity;
  for (const tier of [1, 2, 3, 4, 5] as const) {
    const d = Math.abs(Math.log(fee / TIER_FEE[tier]));
    if (d < best) { best = d; band = tier; }
  }
  return band;
}

/**
 * 자마 성적 배수. 같은 가격대 종마(출주 자마 MIN 이상)의 두당 상금 평균과 비교한다(2026-10-15 Opus):
 * 자마 능력이 부 등급을 따르므로 전체 평균과 비교하면 비싼 종마가 해마다 구조적으로 오른다.
 * 같은 가격대 비교 대상이 FEE_PROGENY_MIN_PEERS 미만이면 전체와 비교한다.
 */
export function progenyMultiplier(state: GameState, stallionId: HorseId): number {
  const stats = state.sireStats[stallionId];
  const self = state.stallions[stallionId];
  if (!stats || !self || stats.starters < config.FEE_PROGENY_MIN_STARTERS) return 1;
  const band = feeBand(self.fee);
  const all: { band: number; value: number }[] = Object.keys(state.stallions).sort().flatMap(id => {
    const peer = state.sireStats[id];
    const peerStallion = state.stallions[id];
    return peer && peerStallion && peer.starters >= config.FEE_PROGENY_MIN_STARTERS
      ? [{ band: feeBand(peerStallion.fee), value: peer.earnings / peer.starters }] : [];
  });
  const sameBand = all.filter((p) => p.band === band);
  const peers = sameBand.length >= config.FEE_PROGENY_MIN_PEERS ? sameBand : all;
  const avg = peers.reduce((sum, p) => sum + p.value, 0) / peers.length;
  const ratio = avg > 0 ? (stats.earnings / stats.starters) / avg : 1;
  return clamp(ratio ** config.FEE_PROGENY_EXPONENT, config.FEE_PROGENY_MULT_MIN, config.FEE_PROGENY_MULT_MAX);
}

/**
 * 수요 배수. 그 인기에서 기대되는 수요(북 × baseDemandRatio(인기))와 비교한다(2026-10-15 Opus):
 * 북 상한과 비교하면 인기 높은 종마는 해마다 오르고 낮은 종마는 해마다 내린다.
 * 넘친 수요(신인 가산·변동)가 있으면 오르고 모자라면 내린다.
 */
export function demandMultiplier(stallion: Stallion): number {
  const nhMult = stallion.studRole === 'nh' || stallion.studRole === 'dual'
    ? 1 + ((stallion.nhReputation ?? NH_REPUTATION_NEUTRAL) - NH_REPUTATION_NEUTRAL)
      / NH_REPUTATION_NEUTRAL * NH_REPUTATION_DEMAND_AMPLITUDE : 1;
  if (stallion.aiDemand <= 0) return nhMult;
  const expected = stallion.bookLimit * baseDemandRatio(stallion.popularity);
  return nhMult * clamp(1 + config.FEE_DEMAND_SLOPE * (stallion.aiDemand / expected - 1),
    config.FEE_DEMAND_MULT_MIN, config.FEE_DEMAND_MULT_MAX);
}

/** 상태와 난수를 바꾸지 않고 다음 시즌 시장 가격을 계산한다. */
export function reviewFee(state: GameState, stallionId: HorseId, year: number): {
  fee: Money; popularity: number; fertility: number; marketBaseFee: Money;
} {
  const stallion = state.stallions[stallionId];
  const horse = state.horses[stallionId];
  if (!stallion || !horse) throw new Error(`reviewFee: 종마 없음: ${stallionId}`);
  const age = year - horse.birthYear;
  const base = stallion.marketBaseFee ?? stallion.fee;
  const marketBaseFee = base * progenyMultiplier(state, stallionId) ** config.FEE_BASE_DRIFT_EXPONENT;
  const target = marketBaseFee * demandMultiplier(stallion)
    * (age >= config.FEE_OLD_AGE ? config.FEE_OLD_MULT : 1)
    * (stallion.fertility < config.FEE_LOW_FERTILITY ? config.FEE_LOW_FERTILITY_MULT : 1);
  const raw = stallion.fee * (target / stallion.fee) ** config.FEE_ADJUST_SPEED;
  const fee = Math.max(config.STUD_FEE_MIN, roundStudFee(clamp(raw,
    stallion.fee * (1 - config.FEE_YEARLY_CHANGE_MAX),
    stallion.fee * (1 + config.FEE_YEARLY_CHANGE_MAX))));
  const popularity = clamp(Math.round(config.POPULARITY_AT_LOW
    + (config.POPULARITY_AT_HIGH - config.POPULARITY_AT_LOW)
    * Math.log(fee / config.POPULARITY_REF_LOW_FEE)
    / Math.log(config.POPULARITY_REF_HIGH_FEE / config.POPULARITY_REF_LOW_FEE)),
  config.POPULARITY_MIN, config.POPULARITY_MAX);
  // 저수태 종마(바닥 이하)는 바닥값으로 올리지 않고 그대로 둔다(M4-D5)
  const declining = age >= config.FERTILITY_DECLINE_FROM_AGE && stallion.fertility > config.FERTILITY_FLOOR;
  const fertility = Math.round((declining
    ? Math.max(config.FERTILITY_FLOOR, stallion.fertility - config.FERTILITY_DECLINE_PER_YEAR)
    : stallion.fertility) * 1000) / 1000;
  return { fee, popularity, fertility, marketBaseFee };
}

export function createFeeReviewSystem(): WeeklySystem {
  return {
    id: 'fee_review',
    run(state, { date }) {
      if (date.week !== config.FEE_REVIEW_WEEK) return [];
      const events: GameEvent[] = [];
      for (const id of Object.keys(state.stallions).sort()) {
        const stallion = state.stallions[id]!;
        const horse = state.horses[stallion.horseId];
        if (horse?.status !== 'stud') continue;
        if (stallion.leasedAwayUntil != null && date.year + 1 < stallion.leasedAwayUntil) {
          stallion.fertility = reviewFee(state, id, date.year).fertility;
          continue;
        }
        const prevFee = stallion.fee;
        Object.assign(stallion, reviewFee(state, id, date.year), { prevFee });
        if (horse.ownerId === state.playerOwnerId) events.push({
          type: 'stud_fee_set', stallionId: id, season: date.year + 1,
          fee: stallion.fee, prevFee, date: { ...date },
        });
      }
      return events;
    },
  };
}
