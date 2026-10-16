import { GESTATION_WEEKS } from '../config/breedingSeason';
import * as config from '../config/health';
import { MORTALITY_CHECK_WEEK } from '../config/mortality';
import { createRng } from '../rng';
import type { GameDate, GameEvent, GameState, HorseId, WeeklySystem } from '../types';
import { endBreedingCareer } from './mortality';

type Ailment = Extract<GameEvent, { type: 'stud_ailment' }>['ailment'];
type Outcome = Extract<GameEvent, { type: 'stud_ailment' }>['outcome'];

/** 나이별 제엽염 연간 확률(계단식). */
export function annualLaminitisChance(age: number): number {
  let chance = 0;
  for (const [minAge, probability] of config.LAMINITIS_BY_AGE) {
    if (age >= minAge) chance = probability;
  }
  return chance;
}

function judgeMareLoss(draft: GameState, id: HorseId, date: GameDate, events: GameEvent[]): void {
  const mare = draft.mares[id];
  const horse = draft.horses[id];
  if (horse?.status !== 'broodmare' || !mare?.pregnant) return;
  const ageMultiplier = date.year - horse.birthYear >= config.MARE_LOSS_OLDER_AGE
    ? config.MARE_LOSS_OLDER_MULTIPLIER : 1;
  const pregnancyRisk = config.MARE_LOSS_PER_PREGNANCY * ageMultiplier;
  const weeklyRisk = 1 - (1 - pregnancyRisk) ** (1 / GESTATION_WEEKS);
  const rng = createRng(`${draft.initialSeed}:mare-loss:${id}:${date.year}:${date.week}`);
  if (!rng.chance(weeklyRisk)) return;
  mare.pregnant = false;
  mare.dueWeek = null;
  mare.coveredBy = null;
  mare.coveredFee = null;
  mare.coveredWeek = null;
  if (horse.ownerId === draft.playerOwnerId) {
    events.push({ type: 'mare_lost_foal', mareId: id, date: { ...date } });
  }
}

function judgeAilment(
  draft: GameState, id: HorseId, ailment: Ailment, date: GameDate, events: GameEvent[],
): void {
  const horse = draft.horses[id];
  if (horse === undefined || (horse.status !== 'stud' && horse.status !== 'broodmare')) return;
  const chance = ailment === 'laminitis'
    ? annualLaminitisChance(date.year - horse.birthYear) : config.COLIC_ANNUAL_CHANCE;
  const rng = createRng(`${draft.initialSeed}:${ailment}:${id}:${date.year}`);
  if (!rng.chance(chance)) return;
  const roll = rng.next();
  const outcome: Outcome = ailment === 'colic'
    ? (roll < config.COLIC_RECOVERY_SHARE ? 'recovered' : 'died')
    : roll < config.LAMINITIS_RECOVERY_SHARE ? 'recovered'
      : roll < config.LAMINITIS_RECOVERY_SHARE + config.LAMINITIS_RETIREMENT_SHARE ? 'retired' : 'died';
  const from = horse.status;
  const notable = horse.ownerId === draft.playerOwnerId || draft.stallions[id]?.realKey != null;
  if (outcome === 'recovered') {
    const stallion = draft.stallions[id];
    if (ailment === 'laminitis' && from === 'stud' && stallion !== undefined) {
      stallion.fertility = Math.max(0, stallion.fertility - config.LAMINITIS_FERTILITY_LOSS);
    }
  } else {
    endBreedingCareer(draft, id, date, outcome === 'died' ? 'dead' : 'retired');
  }
  if (!notable) return;
  events.push({ type: 'stud_ailment', horseId: id, ailment, outcome, date: { ...date } });
  if (outcome === 'died') {
    events.push({ type: 'horse_died', horseId: id, cause: 'illness', date: { ...date } });
  } else if (outcome === 'retired') {
    events.push({ type: 'horse_status_changed', horseId: id, from, to: 'retired', date: { ...date } });
    if (from === 'stud') {
      events.push({ type: 'stallion_pensioned', stallionId: id, reason: 'age', date: { ...date } });
    }
  }
}

/** 매주 유산, 30주에 질환을 판정한다. 공용 난수와 내부 상태를 쓰지 않는다. mortality 다음에 등록한다. */
export function createBreedingHealthSystem(): WeeklySystem {
  return {
    id: 'breeding_health',
    run(draft, { date }): GameEvent[] {
      const events: GameEvent[] = [];
      for (const id of Object.keys(draft.mares).sort()) judgeMareLoss(draft, id, date, events);
      if (date.week === MORTALITY_CHECK_WEEK) {
        for (const id of Object.keys(draft.horses).sort()) {
          judgeAilment(draft, id, 'laminitis', date, events);
          judgeAilment(draft, id, 'colic', date, events);
        }
      }
      return events;
    },
  };
}
