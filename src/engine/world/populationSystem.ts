import {
  POPULATION_COUNTRY_ORDER,
  POPULATION_CUT_MIN_AGE,
  POPULATION_CUT_SHARE,
  POPULATION_ENTRY_AGE,
  POPULATION_GELDING_MIN_AGE,
  POPULATION_GELDING_SHARE,
  POPULATION_RATING_MIN_AGE,
  POPULATION_RETIRE_AGE,
} from '../config/population';
import { sortStallionRecords } from '../state/stallionHorses';
import type { GameDate, GameEvent, GameState, Horse, WeeklySystem } from '../types';
import {
  ageOf,
  buildMarket,
  drawSexAndGelding,
  isRacingHorse,
  racingHorseIds,
  spawnRacingHorse,
  type RacingPopulationStaticData,
} from './population';
import { initialOfficialRating, meanAbility, ratingFromAbility } from './rating';

/** 연간 교체가 일어나는 주(1월 1주) */
const REPLACEMENT_WEEK = 1;

/**
 * 은퇴 처리: status 를 'retired' 로 바꾸고 조교사 연결을 끊는다. 마주 연결(ownerId·horseIds)은 유지한다.
 * 나라별 은퇴 두수를 retiredByCountry 에 센다(같은 해 신규 투입 두수가 된다).
 */
function retireHorse(
  horse: Horse,
  date: GameDate,
  events: GameEvent[],
  retiredByCountry: Map<string, number>,
): void {
  const from = horse.status;
  horse.status = 'retired';
  horse.trainerId = null;
  events.push({ type: 'horse_status_changed', horseId: horse.id, from, to: 'retired', date });
  retiredByCountry.set(horse.countryOfBirth, (retiredByCountry.get(horse.countryOfBirth) ?? 0) + 1);
}

/** 선발 기준값: OR 이 있으면 OR, 없으면 잠재 능력 평균을 같은 척도(OR)로 환산 */
function selectionValue(horse: Horse): number {
  return horse.officialRating ?? ratingFromAbility(meanAbility(horse.potential));
}

/**
 * 마이그레이션 직후(lastPopulationYear 가 null)에만 쓰는 대체 판정: 신규 2세(birthYear = 연도 − 2)가 있으면 끝난 것으로 본다.
 * 새 게임은 bootstrapGame 이 lastPopulationYear 를 시작 연도로 채우므로 이 판정을 쓰지 않는다.
 */
function entryDoneFor(state: GameState, year: number): boolean {
  return racingHorseIds(state).some((id) => state.horses[id]?.birthYear === year - POPULATION_ENTRY_AGE);
}

/**
 * 연간 교체 시스템(id 'population'). 1월 1주에만 동작한다.
 * 순서: 8세 이상 전원 은퇴 → 4세가 된 수말 거세 판정 → 3세 이상 OR 부여 →
 *       4세 이상 나라별 하위 CUT_SHARE 은퇴 → 나라별 신규 2세 투입(두수 = 그 나라 그 해 은퇴 두수).
 * 중복 실행 방지: seasonState.lastPopulationYear 가 올해면 아무것도 하지 않고, 실행 후 올해로 갱신한다.
 * 처리 순서는 ID 오름차순·나라 순서로 고정되어 같은 상태 + 같은 rng → 같은 결과다.
 */
export function createPopulationSystem(data: RacingPopulationStaticData): WeeklySystem {
  return {
    id: 'population',
    run(draft: GameState, ctx) {
      if (ctx.date.week !== REPLACEMENT_WEEK) return [];
      const year = ctx.date.year;
      const lastYear = draft.seasonState.lastPopulationYear;
      if (lastYear === year) return [];
      if (lastYear === null && entryDoneFor(draft, year)) return [];

      const events: GameEvent[] = [];
      const date = ctx.date;
      const retiredByCountry = new Map<string, number>();

      // 1. 8세 이상 전원 은퇴
      for (const id of racingHorseIds(draft)) {
        const horse = draft.horses[id];
        if (horse && ageOf(horse, year) >= POPULATION_RETIRE_AGE) {
          retireHorse(horse, date, events, retiredByCountry);
        }
      }

      // 2. 4세가 된 수말 거세 판정, 3세 이상 OR 부여
      for (const id of racingHorseIds(draft)) {
        const horse = draft.horses[id];
        if (!horse || !isRacingHorse(draft, horse)) continue;
        const age = ageOf(horse, year);
        if (age === POPULATION_GELDING_MIN_AGE && horse.sex === 'male' && !horse.gelded) {
          horse.gelded = ctx.rng.chance(POPULATION_GELDING_SHARE);
        }
        if (age >= POPULATION_RATING_MIN_AGE && horse.officialRating === null) {
          horse.officialRating = initialOfficialRating(horse);
        }
      }

      // 3. 4세 이상 나라별 하위 CUT_SHARE 은퇴 (선발 기준값 오름차순, 동점은 ID 순)
      for (const country of POPULATION_COUNTRY_ORDER) {
        const candidates: Horse[] = [];
        for (const id of racingHorseIds(draft)) {
          const horse = draft.horses[id];
          if (horse && horse.countryOfBirth === country && isRacingHorse(draft, horse) && ageOf(horse, year) >= POPULATION_CUT_MIN_AGE) {
            candidates.push(horse);
          }
        }
        candidates.sort((a, b) => selectionValue(a) - selectionValue(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        const cutCount = Math.round(candidates.length * POPULATION_CUT_SHARE);
        for (let i = 0; i < cutCount; i++) {
          retireHorse(candidates[i] as Horse, date, events, retiredByCountry);
        }
      }

      // 4. 나라별 신규 2세 투입 = 그 해 그 나라 은퇴 두수 (마주·조교사 부하는 은퇴 뒤의 상태로 계산)
      const market = buildMarket(draft);
      const used = new Set(Object.values(draft.horses).map((h) => h.name));
      const records = sortStallionRecords(data.stallionRecords);
      for (const country of POPULATION_COUNTRY_ORDER) {
        const count = retiredByCountry.get(country) ?? 0;
        for (let i = 0; i < count; i++) {
          const { sex, gelded } = drawSexAndGelding(ctx.rng, POPULATION_ENTRY_AGE);
          spawnRacingHorse(
            draft,
            data,
            ctx.rng,
            market,
            used,
            { country, birthYear: year - POPULATION_ENTRY_AGE, currentYear: year, sex, gelded },
            records,
          );
        }
      }

      draft.seasonState.lastPopulationYear = year;
      return events;
    },
  };
}
