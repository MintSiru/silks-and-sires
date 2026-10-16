import { PLAYER_SIRE_CROP_PER_CONCEPTION, PRIVATE_STALLION_CHANCE } from '../config/stud';
import { createRng } from '../rng';
import { makeNameRegistry } from '../naming/context';
import {
  POPULATION_AI_STALLION_ENTRY_PER_YEAR,
  POPULATION_AI_NH_STALLION_ENTRY_PER_YEAR,
  POPULATION_AI_NH_STALLION_MIN_VALUE,
  POPULATION_AI_STALLION_MIN_VALUE,
  POPULATION_BROODMARE_RETIRE_BANDS,
  POPULATION_COUNTRY_ORDER,
  POPULATION_CUT_SHARE_BY_AGE,
  POPULATION_ENTRY_AGE,
  POPULATION_GELDING_MIN_AGE,
  POPULATION_GELDING_SHARE,
  POPULATION_RATING_MIN_AGE,
  POPULATION_RETIRE_AGE,
  POPULATION_STUD_RETIRE_BANDS,
  type EarlyRetireBand,
  type PopulationCountry,
} from '../config/population';
import { sortStallionRecords } from '../state/stallionHorses';
import { applyStudRole, chooseStudRole, horseProfile } from '../stud/nh';
import { buildStallionRecord } from '../stud/stand';
import type { GameDate, GameEvent, GameState, Horse, HorseStatus, Rng, WeeklySystem } from '../types';
import {
  ageOf,
  buildMarket,
  drawSexAndGelding,
  isRacingHorse,
  pickTrainer,
  racingHorseIds,
  spawnRacingHorse,
  type PopulationMarket,
  type RacingPopulationStaticData,
} from './population';
import { initialOfficialRating, meanAbility, ratingFromAbility } from './rating';

/** 연간 교체가 일어나는 주(1월 1주) */
const REPLACEMENT_WEEK = 1;

/** 세일 출신 편입 대상 상태(M4-C4): 아직 조교 전인 어린 말 */
const SALE_ORIGIN_STATUSES: readonly HorseStatus[] = ['foal', 'weanling', 'yearling'];

/**
 * 말의 현역 집단 나라(M4-C4). 태생국이 유럽 5개국이면 태생국, 아니면 마주 나라가 유럽 5개국이면 마주 나라, 아니면 'GB'.
 * 지금까지의 말은 모두 유럽산이라 countryOfBirth 와 같은 값을 준다.
 */
export function racingCountryOf(state: GameState, horse: Horse): PopulationCountry {
  if (isPopulationCountry(horse.countryOfBirth)) return horse.countryOfBirth;
  const owner = horse.ownerId === null ? undefined : state.owners[horse.ownerId];
  if (owner !== undefined && isPopulationCountry(owner.country)) return owner.country;
  return 'GB';
}

function isPopulationCountry(country: string): country is PopulationCountry {
  return (POPULATION_COUNTRY_ORDER as readonly string[]).includes(country);
}

/**
 * 은퇴 처리: status 를 'retired' 로 바꾸고 조교사 연결을 끊는다. 마주 연결(ownerId·horseIds)은 유지한다.
 * 나라별 은퇴 두수를 retiredByCountry 에 센다(같은 해 신규 투입 두수가 된다).
 */
function retireHorse(
  state: GameState,
  horse: Horse,
  date: GameDate,
  events: GameEvent[],
  retiredByCountry: Map<PopulationCountry, number>,
): void {
  const from = horse.status;
  const country = racingCountryOf(state, horse);
  horse.status = 'retired';
  horse.trainerId = null;
  events.push({ type: 'horse_status_changed', horseId: horse.id, from, to: 'retired', date });
  retiredByCountry.set(country, (retiredByCountry.get(country) ?? 0) + 1);
}

/** 선발 기준값: OR 이 있으면 OR, 없으면 잠재 능력 평균을 같은 척도(OR)로 환산 */
function selectionValue(horse: Horse): number {
  return horse.officialRating ?? ratingFromAbility(meanAbility(horse.potential));
}

/**
 * 조기 은퇴 밴드 표: 수말(거세 안 함)은 종마 표, 암말은 번식 표, 거세마는 null(이 단계 없음).
 */
function earlyRetireBandsFor(horse: Horse): readonly EarlyRetireBand[] | null {
  if (horse.sex === 'female') return POPULATION_BROODMARE_RETIRE_BANDS;
  if (horse.gelded) return null;
  return POPULATION_STUD_RETIRE_BANDS;
}

/** 조기 은퇴 확률: 나이·평가값에 처음 맞는 밴드의 확률. 맞는 밴드가 없으면 0 */
function earlyRetireChance(bands: readonly EarlyRetireBand[], age: number, value: number): number {
  for (const band of bands) {
    if (age >= band.minAge && age <= band.maxAge && value >= band.minValue) return band.chance;
  }
  return 0;
}

/**
 * 마이그레이션 직후(lastPopulationYear 가 null)에만 쓰는 대체 판정: 신규 2세(birthYear = 연도 − 2)가 있으면 끝난 것으로 본다.
 * 새 게임은 bootstrapGame 이 lastPopulationYear 를 시작 연도로 채우므로 이 판정을 쓰지 않는다.
 */
function entryDoneFor(state: GameState, year: number): boolean {
  return racingHorseIds(state).some((id) => state.horses[id]?.birthYear === year - POPULATION_ENTRY_AGE);
}

/**
 * 세일 출신 편입(M4-C4): AI 마주가 가진 foal·weanling·yearling 중 올해 POPULATION_ENTRY_AGE 세 이상인 말을
 * in_training 으로 올리고 조교사를 붙인다. 조교사 나라는 racingCountryOf. ID 오름차순.
 * 나라별 편입 두수를 돌려준다(신규 투입 두수를 줄이는 데 쓴다).
 */
function enrollSaleHorses(
  draft: GameState,
  year: number,
  market: PopulationMarket,
  rng: Rng,
): Map<PopulationCountry, number> {
  const enrolled = new Map<PopulationCountry, number>();
  for (const id of Object.keys(draft.horses).sort()) {
    const horse = draft.horses[id];
    if (!horse || !SALE_ORIGIN_STATUSES.includes(horse.status)) continue;
    if (horse.ownerId === null || horse.ownerId === draft.playerOwnerId) continue;
    const owner = draft.owners[horse.ownerId];
    if (owner === undefined || owner.isPlayer) continue;
    if (ageOf(horse, year) < POPULATION_ENTRY_AGE) continue;

    const country = racingCountryOf(draft, horse);
    horse.status = 'in_training';
    horse.trainerId = pickTrainerIfOpen(rng, market, country);
    enrolled.set(country, (enrolled.get(country) ?? 0) + 1);
  }
  return enrolled;
}

/** 조교사 수용 여유가 있으면 고르고, 없으면 null(편입 자체는 막지 않는다) */
function pickTrainerIfOpen(rng: Rng, market: PopulationMarket, country: PopulationCountry): string | null {
  const open = market.trainers[country].some((t) => (market.load.get(t.id) ?? 0) < t.capacity);
  return open ? pickTrainer(rng, market, country).id : null;
}

/**
 * 연간 교체 시스템(id 'population'). 1월 1주에만 동작한다.
 * 순서: 8세 이상 전원 은퇴 → 4세가 된 수말 거세 판정 → 3세 이상 OR 부여 →
 *       상위마 조기 은퇴(종마·번식 밴드 확률, 나라 순서 → 말 ID 오름차순) →
 *       나라·나이별 하위 정리(POPULATION_CUT_SHARE_BY_AGE, 선발 기준값 하위) →
 *       세일 출신 편입(M4-C4, AI 마주의 어린 말을 in_training 으로) →
 *       나라별 신규 2세 투입(두수 = 그 나라 그 해 은퇴 두수 − 세일 출신 편입 두수, 0 이하면 없음).
 * 나라는 racingCountryOf 로 정한다(태생국이 유럽 5개국이면 태생국, 아니면 마주 나라, 아니면 GB).
 * 중복 실행 방지: seasonState.lastPopulationYear 가 올해면 아무것도 하지 않고, 실행 후 올해로 갱신한다.
 * 처리 순서는 나라 순서·ID 오름차순으로 고정되어 같은 상태 + 같은 rng → 같은 결과다.
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
      const retiredByCountry = new Map<PopulationCountry, number>();

      // 1. 8세 이상 전원 은퇴
      for (const id of racingHorseIds(draft)) {
        const horse = draft.horses[id];
        if (horse && ageOf(horse, year) >= POPULATION_RETIRE_AGE) {
          retireHorse(draft, horse, date, events, retiredByCountry);
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

      // 3. 상위마 조기 은퇴 (나라 순서 → 말 ID 오름차순, 확률 판정마다 rng 를 한 번 쓴다)
      const afterGelding = racingHorseIds(draft);
      const studEntrants: Horse[] = [];
      for (const country of POPULATION_COUNTRY_ORDER) {
        for (const id of afterGelding) {
          const horse = draft.horses[id];
          if (!horse || racingCountryOf(draft, horse) !== country || !isRacingHorse(draft, horse)) continue;
          const bands = earlyRetireBandsFor(horse);
          if (bands === null) continue;
          const chance = earlyRetireChance(bands, ageOf(horse, year), selectionValue(horse));
          if (chance > 0 && ctx.rng.chance(chance)) {
            retireHorse(draft, horse, date, events, retiredByCountry);
            if (horse.sex === 'male' && !horse.gelded && selectionValue(horse) >= POPULATION_AI_STALLION_MIN_VALUE) {
              studEntrants.push(horse);
            }
          }
        }
      }

      // 종마 편입의 비공개 판정·수태율은 말별 독립 스트림으로 정한다.
      studEntrants.sort((a, b) => selectionValue(b) - selectionValue(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      for (const horse of studEntrants.slice(0, POPULATION_AI_STALLION_ENTRY_PER_YEAR)) {
        const country = racingCountryOf(draft, horse);
        draft.stallions[horse.id] = { ...applyStudRole(buildStallionRecord(draft, horse.id, year, country),
          chooseStudRole(draft, horse)), aiEntrant: true };
        const owner = horse.ownerId === null ? undefined : draft.owners[horse.ownerId];
        const makePrivate = owner !== undefined && !owner.isPlayer && owner.studName !== null
          && owner.tier === 'major'
          && createRng(`${draft.initialSeed}:private-stallion:${horse.id}`).chance(PRIVATE_STALLION_CHANCE);
        if (makePrivate) draft.stallions[horse.id]!.privateTo = owner.id;
        else {
          if (owner !== undefined) owner.horseIds = owner.horseIds.filter((id) => id !== horse.id);
          horse.ownerId = null;
        }
        horse.status = 'stud';
        horse.trainerId = null;
      }

      // 4. 나라·나이별 하위 정리 (선발 기준값 오름차순, 동점은 ID 순). 조기 은퇴마는 이미 빠져 있다.
      const activeIds = racingHorseIds(draft);
      for (const country of POPULATION_COUNTRY_ORDER) {
        for (const { age, share } of POPULATION_CUT_SHARE_BY_AGE) {
          const candidates: Horse[] = [];
          for (const id of activeIds) {
            const horse = draft.horses[id];
            if (
              horse &&
              racingCountryOf(draft, horse) === country &&
              isRacingHorse(draft, horse) &&
              ageOf(horse, year) === age
            ) {
              candidates.push(horse);
            }
          }
          candidates.sort((a, b) => selectionValue(a) - selectionValue(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
          const cutCount = Math.round(candidates.length * share);
          for (let i = 0; i < cutCount; i++) {
            retireHorse(draft, candidates[i] as Horse, date, events, retiredByCountry);
          }
        }
      }

      // 4b. NH 종마 편입(M4-F1b): 올해 은퇴한 AI 비거세 수말 중 중장거리·컵 프로필은 평지 기준에 못 미쳐도 NH·겸용 종마로 선다.
      //     (평지 선발 기준만으로는 컵 프로필 편입이 0두라 docs/stamina-and-nh.md 의 'NH 로 피를 잇는' 경로가 없었다.) 공용 rng 미사용.
      const enteredIds = new Set(studEntrants.slice(0, POPULATION_AI_STALLION_ENTRY_PER_YEAR).map((h) => h.id));
      const nhEntrants = events
        .filter((e) => e.type === 'horse_status_changed' && e.to === 'retired')
        .map((e) => (e.type === 'horse_status_changed' ? draft.horses[e.horseId] : undefined))
        .filter((h): h is Horse => h !== undefined && !enteredIds.has(h.id) && h.status === 'retired'
          && h.sex === 'male' && !h.gelded && h.ownerId !== draft.playerOwnerId && draft.stallions[h.id] === undefined
          && (horseProfile(h) === 'middle' || horseProfile(h) === 'cup')
          && selectionValue(h) >= POPULATION_AI_NH_STALLION_MIN_VALUE)
        .sort((a, b) => selectionValue(b) - selectionValue(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .slice(0, POPULATION_AI_NH_STALLION_ENTRY_PER_YEAR);
      for (const horse of nhEntrants) {
        const country = racingCountryOf(draft, horse);
        const chosen = chooseStudRole(draft, horse);
        draft.stallions[horse.id] = { ...applyStudRole(buildStallionRecord(draft, horse.id, year, country),
          chosen === 'flat' ? 'dual' : chosen), aiEntrant: true };
        const owner = horse.ownerId === null ? undefined : draft.owners[horse.ownerId];
        if (owner !== undefined) owner.horseIds = owner.horseIds.filter((id) => id !== horse.id);
        horse.ownerId = null;
        horse.status = 'stud';
        horse.trainerId = null;
      }

      // 5. 세일 출신 편입(M4-C4): AI 마주의 어린 말을 현역으로 올린다. 마주·조교사 부하는 은퇴 뒤의 상태로 계산
      const market = buildMarket(draft);
      const enrolled = enrollSaleHorses(draft, year, market, ctx.rng);

      const registry = makeNameRegistry(draft);
      const records = sortStallionRecords(data.stallionRecords);
      // 5b. 교배 3년 뒤 내 종마 자마를 편입한다. 두수 추첨은 독립 스트림을 쓴다.
      const crops = new Map<PopulationCountry, number>();
      const seasons = draft.stud.seasons
        .filter((season) => season.year === year - 3)
        .sort((a, b) => a.stallionId < b.stallionId ? -1 : a.stallionId > b.stallionId ? 1 : 0);
      for (const season of seasons) {
        const { stallionId, conceptions } = season;
        const stallion = draft.stallions[stallionId];
        if (stallion === undefined || draft.horses[stallionId] === undefined) continue;
        const rng = createRng(`${draft.initialSeed}:player-sire-crop:${stallionId}:${year}`);
        const expected = conceptions * PLAYER_SIRE_CROP_PER_CONCEPTION;
        const count = Math.floor(expected) + (rng.next() < expected - Math.floor(expected) ? 1 : 0);
        const country = isPopulationCountry(stallion.standsIn) ? stallion.standsIn : 'GB';
        for (let i = 0; i < count; i++) {
          const { sex, gelded } = drawSexAndGelding(ctx.rng, POPULATION_ENTRY_AGE);
          spawnRacingHorse(draft, data, ctx.rng, market, registry,
            { country, birthYear: year - POPULATION_ENTRY_AGE, currentYear: year, sex, gelded, sireHorseId: stallionId },
            records);
        }
        crops.set(country, (crops.get(country) ?? 0) + count);
      }

      // 6. 내 종마 자마만큼 일반 신규 투입을 줄인다.
      for (const country of POPULATION_COUNTRY_ORDER) {
        const count = Math.max(0, (retiredByCountry.get(country) ?? 0) - (enrolled.get(country) ?? 0) - (crops.get(country) ?? 0));
        for (let i = 0; i < count; i++) {
          const { sex, gelded } = drawSexAndGelding(ctx.rng, POPULATION_ENTRY_AGE);
          spawnRacingHorse(
            draft,
            data,
            ctx.rng,
            market,
            registry,
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
