/**
 * 종마·번식 암말의 이른 사망(M4-D9). 번식 시즌이 끝난 뒤(MORTALITY_CHECK_WEEK) 한 번 판정한다.
 * 말마다 독립 시드 스트림(`${initialSeed}:mortality:${id}:${year}`)을 쓰므로 다른 단계의 난수에 영향을 주지 않는다.
 * 사망한 종마의 미수태 교배·사전 예약과 사망한 암말의 교배·예약은 정리하고 종부료를 환불한다(장부 stud_fee_paid).
 */
import {
  MORTALITY_AGE_CAUSE_FROM,
  MORTALITY_BY_AGE,
  MORTALITY_CHECK_WEEK,
  MORTALITY_YOUNG_ACCIDENT_SHARE,
} from '../config/mortality';
import { recordMoney } from '../economy/ledger';
import { createRng } from '../rng';
import type { GameDate, GameEvent, GameState, HorseId, WeeklySystem } from '../types';

/** 나이별 연간 사망 확률(MORTALITY_BY_AGE 계단식). 최소 나이 미만이면 0 */
export function annualDeathChance(age: number): number {
  let chance = 0;
  for (const [minAge, p] of MORTALITY_BY_AGE) {
    if (age >= minAge) chance = p;
  }
  return chance;
}

/**
 * 종부료 환불. 암말 소유자가 종마 소유자와 다를 때만 돌려준다(장부 stud_fee_paid +fee).
 * 종부료는 종마의 현재 fee 로 한다(기존 예약 환불 규칙과 같다).
 */
function refundStudFee(
  draft: GameState,
  stallionId: HorseId,
  mareId: HorseId,
  date: GameDate,
): void {
  const stallion = draft.stallions[stallionId];
  const payer = draft.horses[mareId]?.ownerId ?? null;
  if (stallion === undefined || payer === null) return;
  if (payer === (draft.horses[stallionId]?.ownerId ?? null)) return;
  recordMoney(draft, payer, 'stud_fee_paid', stallion.fee, date, mareId);
}

/** 사망한 종마에 걸린 미수태 교배·사전 예약을 지우고 환불한다. 임신 중인 암말의 교배는 건드리지 않는다. */
function clearStallionBookings(draft: GameState, stallionId: HorseId, date: GameDate): void {
  for (const mareId of Object.keys(draft.mares).sort()) {
    const mare = draft.mares[mareId];
    if (mare === undefined) continue;
    if (mare.coveredBy === stallionId && !mare.pregnant) {
      refundStudFee(draft, stallionId, mareId, date);
      mare.coveredBy = null;
      mare.coveredWeek = null;
    }
    if (mare.bookedFor?.stallionId === stallionId) {
      refundStudFee(draft, stallionId, mareId, date);
      mare.bookedFor = null;
    }
  }
}

/**
 * 사망한 암말 정리. 임신 중이면 유산(임신·출산 예정 해제, 종부료는 환불하지 않는다).
 * 미수태 교배·사전 예약은 지우고 환불한다. 죽은 암말은 교배 판정·출산 대상이 되지 않도록 모두 비운다.
 */
function clearMareBookings(draft: GameState, mareId: HorseId, date: GameDate): void {
  const mare = draft.mares[mareId];
  if (mare === undefined) return;
  if (mare.pregnant) {
    mare.pregnant = false;
    mare.dueWeek = null;
    mare.coveredBy = null;
    mare.coveredWeek = null;
  } else if (mare.coveredBy !== null) {
    refundStudFee(draft, mare.coveredBy, mareId, date);
    mare.coveredBy = null;
    mare.coveredWeek = null;
  }
  if (mare.bookedFor != null) {
    refundStudFee(draft, mare.bookedFor.stallionId, mareId, date);
    mare.bookedFor = null;
  }
}

/**
 * 종마·번식 암말 사망 시스템(id 'mortality'). MORTALITY_CHECK_WEEK 주에만 동작한다.
 * 대상: status 가 'stud' 또는 'broodmare' 인 말, ID 오름차순.
 * 사망 이벤트는 플레이어 소유 말 또는 실명 종마(realKey 가 있는 종마)만 남긴다.
 */
export function createMortalitySystem(): WeeklySystem {
  return {
    id: 'mortality',
    run(draft: GameState, ctx): GameEvent[] {
      if (ctx.date.week !== MORTALITY_CHECK_WEEK) return [];
      const year = ctx.date.year;
      const date: GameDate = { year, week: ctx.date.week };
      const events: GameEvent[] = [];

      for (const id of Object.keys(draft.horses).sort()) {
        const horse = draft.horses[id];
        if (horse === undefined) continue;
        if (horse.status !== 'stud' && horse.status !== 'broodmare') continue;

        const age = year - horse.birthYear;
        const rng = createRng(`${draft.initialSeed}:mortality:${id}:${year}`);
        if (!rng.chance(annualDeathChance(age))) continue;

        let cause: 'age' | 'accident' | 'illness';
        if (age >= MORTALITY_AGE_CAUSE_FROM) {
          cause = 'age';
        } else {
          cause = rng.next() < MORTALITY_YOUNG_ACCIDENT_SHARE ? 'accident' : 'illness';
        }

        const wasStallion = horse.status === 'stud';
        horse.status = 'dead';
        horse.diedYear = year;
        horse.trainerId = null;
        // 소유 기록(ownerId)은 남기되 마주 보유 목록에서는 뺀다(목장 목록에 죽은 말이 보이지 않게, 은퇴와 같은 처리)
        const deadOwner = horse.ownerId === null ? undefined : draft.owners[horse.ownerId];
        if (deadOwner !== undefined) deadOwner.horseIds = deadOwner.horseIds.filter((hid) => hid !== id);

        if (wasStallion && draft.stallions[id] !== undefined) {
          clearStallionBookings(draft, id, date);
        }
        if (draft.mares[id] !== undefined) {
          clearMareBookings(draft, id, date);
        }

        const notable = horse.ownerId === draft.playerOwnerId
          || (draft.stallions[id]?.realKey ?? null) !== null;
        if (notable) {
          events.push({ type: 'horse_died', horseId: id, cause, date: { ...date } });
        }
      }
      return events;
    },
  };
}
