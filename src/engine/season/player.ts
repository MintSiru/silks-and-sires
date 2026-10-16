/**
 * 플레이어 출주·조교사 API (M3-A6c). 모두 순수 함수: 입력 state 를 바꾸지 않고 복제본을 돌려준다.
 * 실패는 예외가 아니라 { ok: false, error } 로 돌려준다.
 */
import { autoRegisterHorseName } from '../naming/register';
import { RETAINER_EXTRA_BOXES } from '../config/economy';
import { CONDITION_MAX, PLAYER_TRAINING_START_AGE } from '../config/season';
import { YEARLING_COMPLEX_START_FITNESS_PER_LEVEL } from '../config/farm';
import { facilityLevel } from '../farm/facilities';
import { meanAbility, ratingFromAbility } from '../world/rating';
import { contractFor } from '../economy/contractQuery';
import { ageInYear } from '../time/calendar';
import type {
  GameDate,
  GameEvent,
  GameState,
  HorseId,
  HorseStatus,
  Meeting,
  RaceId,
  ScheduledRace,
  TrainerId,
} from '../types';
import { isEligible } from './eligibility';

export type DeclareError =
  | 'not_found'
  | 'not_player_horse'
  | 'unnamed'
  | 'no_trainer'
  | 'not_eligible'
  | 'race_closed'
  | 'already_declared'
  | 'field_full';

export type WithdrawError = 'not_found' | 'race_closed' | 'not_declared';

export type AssignTrainerError = 'not_found' | 'not_player_horse' | 'trainer_not_found' | 'invalid_status' | 'trainer_full';

export type PlayerResult<E extends string> =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: E };

/** 조교사 배정이 가능한 말 상태. 그 밖(성숙한 번식마·은퇴마 등)은 invalid_status */
const ASSIGNABLE_STATUSES: readonly HorseStatus[] = ['weanling', 'yearling', 'in_training', 'resting'];

function fail<E extends string>(error: E): { ok: false; error: E } {
  return { ok: false, error };
}

function sameWeek(a: GameDate, b: GameDate): boolean {
  return a.year === b.year && a.week === b.week;
}

/** 개최 id + 레이스 id 로 개최 레이스를 찾는다(복제본에서 쓴다) */
function locate(
  state: GameState,
  meetingId: string,
  raceId: RaceId,
): { meeting: Meeting; sr: ScheduledRace } | undefined {
  const meeting = state.seasonState.meetings.find((m) => m.id === meetingId);
  if (meeting === undefined) return undefined;
  const sr = meeting.races.find((r) => r.race.id === raceId);
  return sr === undefined ? undefined : { meeting, sr };
}

/** 같은 주의 다른 개최 레이스에 이 말의 선언이 있는가 */
function isDeclaredInWeek(state: GameState, date: GameDate, horseId: HorseId): boolean {
  return state.seasonState.meetings.some(
    (m) =>
      sameWeek(m.date, date) && m.races.some((sr) => sr.declarations.some((d) => d.horseId === horseId)),
  );
}

/** 조교사 한 명이 맡은 말 수(해당 말 제외) */
function trainerLoad(state: GameState, trainerId: TrainerId, exceptHorseId: HorseId): number {
  let n = 0;
  for (const horse of Object.values(state.horses)) {
    if (horse.id !== exceptHorseId && horse.trainerId === trainerId) n += 1;
  }
  return n;
}

/**
 * 플레이어 말을 개최 레이스에 선언한다(Declaration.isPlayer = true).
 * 검사 순서: 개최·레이스·말 존재 → 플레이어 말 → 이름 등록 → 레이스 open → 조교사 → 출주 조건 → 같은 주 중복 → 두수 여유.
 */
export function declarePlayerHorse(
  state: GameState,
  meetingId: string,
  raceId: RaceId,
  horseId: HorseId,
): PlayerResult<DeclareError> {
  const next = structuredClone(state);
  const found = locate(next, meetingId, raceId);
  const horse = next.horses[horseId];
  if (found === undefined || horse === undefined) return fail('not_found');
  if (horse.ownerId !== next.playerOwnerId) return fail('not_player_horse');
  if (horse.nameRegistered === false) return fail('unnamed');
  if (found.sr.status !== 'open') return fail('race_closed');

  const trainerId = horse.trainerId;
  if (trainerId === null) return fail('no_trainer');
  if (!isEligible(horse, found.sr.race, found.meeting.date, next.seasonState)) return fail('not_eligible');
  if (isDeclaredInWeek(next, found.meeting.date, horseId)) return fail('already_declared');
  if (found.sr.declarations.length >= found.sr.race.maxRunners) {
    const ai = found.sr.declarations.filter((d) => !d.isPlayer);
    const value = (id: HorseId): number => {
      const runner = next.horses[id]!;
      return runner.officialRating ?? ratingFromAbility(meanAbility(runner.ability));
    };
    ai.sort((a, b) => value(a.horseId) - value(b.horseId)
      || (a.horseId > b.horseId ? -1 : a.horseId < b.horseId ? 1 : 0));
    const lowest = ai[0];
    if (lowest === undefined) return fail('field_full');
    found.sr.declarations.splice(found.sr.declarations.indexOf(lowest), 1);
  }

  found.sr.declarations.push({
    horseId,
    ownerId: next.playerOwnerId,
    trainerId,
    jockeyId: null,
    weightLb: null,
    isPlayer: true,
  });
  return { ok: true, state: next, events: [] };
}

/** 플레이어 말의 출주 선언을 취소한다. 레이스가 open 일 때만 가능하다. */
export function withdrawPlayerHorse(
  state: GameState,
  meetingId: string,
  raceId: RaceId,
  horseId: HorseId,
): PlayerResult<WithdrawError> {
  const next = structuredClone(state);
  const found = locate(next, meetingId, raceId);
  if (found === undefined) return fail('not_found');
  if (found.sr.status !== 'open') return fail('race_closed');

  const idx = found.sr.declarations.findIndex((d) => d.horseId === horseId && d.isPlayer);
  if (idx < 0) return fail('not_declared');
  found.sr.declarations.splice(idx, 1);
  return { ok: true, state: next, events: [] };
}

/**
 * 플레이어 말을 조교사에게 맡긴다. 조교사 수용 두수(capacity)를 넘으면 실패한다.
 * 그 조교사와 전속 계약 중이면 수용 한도는 capacity + RETAINER_EXTRA_BOXES(M4-B3a).
 * yearling 이고 나이가 PLAYER_TRAINING_START_AGE 이상이면 in_training 으로 바뀐다.
 */
export function assignTrainer(
  state: GameState,
  horseId: HorseId,
  trainerId: TrainerId,
): PlayerResult<AssignTrainerError> {
  const next = structuredClone(state);
  const horse = next.horses[horseId];
  if (horse === undefined) return fail('not_found');
  if (horse.ownerId !== next.playerOwnerId) return fail('not_player_horse');
  const trainer = next.trainers[trainerId];
  if (trainer === undefined) return fail('trainer_not_found');
  if (!ASSIGNABLE_STATUSES.includes(horse.status)) return fail('invalid_status');
  const limit =
    contractFor(next, 'trainer', trainerId) !== undefined ? trainer.capacity + RETAINER_EXTRA_BOXES : trainer.capacity;
  if (horse.trainerId !== trainerId && trainerLoad(next, trainerId, horseId) >= limit) {
    return fail('trainer_full');
  }

  const events: GameEvent[] = [];
  const from = horse.status;
  horse.trainerId = trainerId;
  if (from === 'yearling' && ageInYear(horse.birthYear, next.date.year) >= PLAYER_TRAINING_START_AGE) {
    events.push(...autoRegisterHorseName(horse, next.date));
    horse.status = 'in_training';
    horse.condition.fitness = Math.min(CONDITION_MAX, horse.condition.fitness
      + YEARLING_COMPLEX_START_FITNESS_PER_LEVEL * facilityLevel(next, 'yearling_complex'));
    events.push({
      type: 'horse_status_changed',
      horseId,
      from,
      to: 'in_training',
      date: { ...next.date },
    });
  }
  return { ok: true, state: next, events };
}
