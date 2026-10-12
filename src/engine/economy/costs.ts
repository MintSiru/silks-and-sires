/**
 * 정기 비용 (M4-A2b). 모든 마주(플레이어·AI)에 같은 규칙을 적용한다.
 * - 주간: 조교료(in_training·resting 말), 목장 유지비(상태별 두당 + 두수 체증) → weeklyCosts / createCostsSystem
 * - 레이스마다: 등록료(출주마), 운송비(조교사 나라 ≠ 경마장 나라) → chargeRaceCosts
 * 자금이 음수가 되어도 그대로 둔다(빚·파산은 A3). 모든 변화는 recordMoney 로만 한다. 난수 미사용.
 */
import {
  ENTRY_FEE_MIN,
  ENTRY_FEE_SHARE,
  FARM_SCALE_FREE_HEADS,
  FARM_SCALE_MAX,
  FARM_SCALE_STEP,
  FARM_UPKEEP,
  TRANSPORT_FEE,
  TRANSPORT_NEAR_PAIRS,
} from '../config/economy';
import type {
  CountryCode,
  Declaration,
  GameDate,
  GameState,
  Horse,
  HorseStatus,
  Money,
  OwnerId,
  Race,
  WeeklySystem,
} from '../types';
import { recordMoney } from './ledger';

/** 조교료를 내는 말 상태 */
const TRAINING_STATUSES: readonly HorseStatus[] = ['in_training', 'resting'];

/** 마주별 보유 말(말 ID 오름차순). 소유자가 없는 말은 제외한다 */
function horsesByOwner(draft: GameState): Map<OwnerId, Horse[]> {
  const map = new Map<OwnerId, Horse[]>();
  for (const id of Object.keys(draft.horses).sort()) {
    const horse = draft.horses[id];
    if (horse === undefined || horse.ownerId === null) continue;
    const list = map.get(horse.ownerId);
    if (list === undefined) {
      map.set(horse.ownerId, [horse]);
    } else {
      list.push(horse);
    }
  }
  return map;
}

/** 목장 두수 체증 가산 비율(0 ~ FARM_SCALE_MAX). 기준 두수를 넘는 두수 × FARM_SCALE_STEP, 상한 적용 */
export function farmScaleSurcharge(heads: number): number {
  const excess = Math.max(0, heads - FARM_SCALE_FREE_HEADS);
  return Math.min(FARM_SCALE_MAX, excess * FARM_SCALE_STEP);
}

/** 조교료: 말마다 조교사의 주당 조교료를 말 주인이 낸다 */
function chargeTrainingFees(draft: GameState, ownerId: OwnerId, horses: readonly Horse[], date: GameDate): void {
  for (const horse of horses) {
    if (!TRAINING_STATUSES.includes(horse.status) || horse.trainerId === null) continue;
    const trainer = draft.trainers[horse.trainerId];
    if (trainer === undefined) throw new Error(`weeklyCosts: 조교사 ${horse.trainerId} 없음`);
    recordMoney(draft, ownerId, 'training_fee', -trainer.weeklyFee, date, horse.id);
  }
}

/** 목장 유지비: 마주별 한 주 합계를 한 번에 기록한다(horseId null). 두수 체증을 적용해 정수로 반올림 */
function chargeFarmUpkeep(draft: GameState, ownerId: OwnerId, horses: readonly Horse[], date: GameDate): void {
  let base: Money = 0;
  let heads = 0;
  for (const horse of horses) {
    const perHead = FARM_UPKEEP[horse.status];
    if (perHead === undefined) continue;
    base += perHead;
    heads += 1;
  }
  if (heads === 0) return;
  const total = Math.round(base * (1 + farmScaleSurcharge(heads)));
  recordMoney(draft, ownerId, 'farm_upkeep', -total, date);
}

/** 주간 정기 비용(조교료·목장 유지비). 마주 ID 오름차순 → 마주 안에서 말 ID 오름차순으로 결정적이다 */
export function weeklyCosts(draft: GameState, date: GameDate): void {
  const byOwner = horsesByOwner(draft);
  for (const ownerId of Object.keys(draft.owners).sort()) {
    const horses = byOwner.get(ownerId) ?? [];
    chargeTrainingFees(draft, ownerId, horses, date);
    chargeFarmUpkeep(draft, ownerId, horses, date);
  }
}

/** 주간 정기 비용 시스템(id 'costs'). season 시스템 뒤에서 돈다. 난수 미사용, 이벤트 없음 */
export function createCostsSystem(): WeeklySystem {
  return {
    id: 'costs',
    run(draft: GameState, ctx) {
      weeklyCosts(draft, { year: ctx.date.year, week: ctx.date.week });
      return [];
    },
  };
}

/** 두 나라 사이 운송비. 같은 나라면 0, 근거리 쌍이면 near, 그 밖은 far */
export function transportFeeBetween(from: CountryCode, to: CountryCode): Money {
  if (from === to) return 0;
  const near = TRANSPORT_NEAR_PAIRS.some(
    ([a, b]) => (a === from && b === to) || (a === to && b === from),
  );
  return near ? TRANSPORT_FEE.near : TRANSPORT_FEE.far;
}

/** 등록료 한 두(출주마): 레이스 총상금 × ENTRY_FEE_SHARE, 최소 ENTRY_FEE_MIN, 정수 반올림 */
export function entryFeeFor(race: Race): Money {
  const totalPrize = race.prizeMoney.reduce((acc, m) => acc + m, 0);
  return Math.max(ENTRY_FEE_MIN, Math.round(totalPrize * ENTRY_FEE_SHARE));
}

/**
 * 레이스 결과 반영 때 출주마의 등록료·운송비를 기록한다(recordMoney).
 * runners 는 실제 출주 선언(declarations)이다. 조교사가 없는 말은 운송비를 내지 않는다.
 */
export function chargeRaceCosts(
  draft: GameState,
  race: Race,
  courseCountry: CountryCode,
  runners: readonly Declaration[],
  date: GameDate,
): void {
  const entryFee = entryFeeFor(race);
  for (const decl of runners) {
    recordMoney(draft, decl.ownerId, 'entry_fee', -entryFee, date, decl.horseId);
    if (decl.trainerId === null) continue;
    const trainer = draft.trainers[decl.trainerId];
    if (trainer === undefined) throw new Error(`chargeRaceCosts: 조교사 ${decl.trainerId} 없음`);
    const fee = transportFeeBetween(trainer.country, courseCountry);
    if (fee > 0) {
      recordMoney(draft, decl.ownerId, 'transport', -fee, date, decl.horseId);
    }
  }
}
