/**
 * 종마 관측 수태율·저수태 판명·저수태 은퇴(M4-D5b).
 * 말마다 독립 시드 스트림(`${initialSeed}:subfertile:${id}`, `${initialSeed}:fert-obs:${id}:${year}`)만 쓰고
 * 공용 난수(ctx.rng)는 쓰지 않는다. 같은 시드 = 같은 결과.
 */
import * as config from '../config/stud';
import { createRng } from '../rng';
import type {
  GameEvent, GameState, HorseId, Stallion, StallionFertilitySeason, WeeklySystem,
} from '../types';

/** 공개 수태율 표시 값. 기록이 없으면 estimate(실제 값을 5%p 단위로 반올림). */
export type PublicFertility =
  | { kind: 'none' }
  | { kind: 'estimate'; rate: number }
  | { kind: 'range'; low: number; high: number }
  | { kind: 'exact'; rate: number };

/** 소수 자릿수 정리(부동소수 오차 제거) */
const round = (value: number, digits: number): number => Number(value.toFixed(digits));

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/** 값을 step 배수로 맞춘다(방향: 'nearest' | 'down' | 'up') */
function snapToStep(value: number, step: number, direction: 'nearest' | 'down' | 'up'): number {
  const units = value / step;
  const snapped = direction === 'down' ? Math.floor(units)
    : direction === 'up' ? Math.ceil(units) : Math.round(units);
  return round(snapped * step, 6);
}

/** 최근 seasons 개 시즌의 교배·수태 합. 기록이 없으면 0·0 */
export function observedRate(
  history: readonly StallionFertilitySeason[] | undefined,
  seasons: number,
): { covers: number; conceptions: number } {
  const recent = seasons > 0 ? (history ?? []).slice(-seasons) : [];
  return recent.reduce((sum, season) => ({
    covers: sum.covers + season.covers,
    conceptions: sum.conceptions + season.conceptions,
  }), { covers: 0, conceptions: 0 });
}

/**
 * 화면에 보일 공개 수태율. 최근 PUBLIC_FERTILITY_SEASONS 시즌 합으로 계산한다.
 * 교배 수가 FULL_SAMPLE 이상이면 정확한 값, 0 < 교배 < FULL_SAMPLE 이면 구간, 그 밖(기록 없음·교배 0)은 추정이다.
 */
export function publicFertility(stallion: Stallion): PublicFertility {
  const { covers, conceptions } = observedRate(stallion.fertilityHistory, config.PUBLIC_FERTILITY_SEASONS);
  if (covers === 0) {
    return { kind: 'estimate', rate: snapToStep(stallion.fertility, config.PUBLIC_FERTILITY_STEP, 'nearest') };
  }
  const p = conceptions / covers;
  if (covers >= config.PUBLIC_FERTILITY_FULL_SAMPLE) {
    return { kind: 'exact', rate: round(p, 2) };
  }
  const halfWidth = Math.max(Math.sqrt(p * (1 - p) / covers), config.PUBLIC_FERTILITY_STEP);
  return {
    kind: 'range',
    low: clamp01(snapToStep(p - halfWidth, config.PUBLIC_FERTILITY_STEP, 'down')),
    high: clamp01(snapToStep(p + halfWidth, config.PUBLIC_FERTILITY_STEP, 'up')),
  };
}

export type RetirePlayerError = 'not_found' | 'not_player_stallion' | 'outside_deal_window' | 'leased';

/**
 * 내 종마를 직접 은퇴시킨다(종마 거래 창 안에서만). 종마사 칸이 비고 마주 보유 목록에서 빠진다.
 * 원본 상태는 바꾸지 않고 복제본을 돌려준다.
 */
export function retirePlayerStallion(state: GameState, horseId: HorseId): {
  ok: true; state: GameState; events: GameEvent[];
} | { ok: false; error: RetirePlayerError } {
  const horse = state.horses[horseId];
  if (horse === undefined) return { ok: false, error: 'not_found' };
  if (horse.ownerId !== state.playerOwnerId || horse.status !== 'stud'
    || state.stallions[horseId] === undefined) return { ok: false, error: 'not_player_stallion' };
  if (state.date.week < config.STUD_DEAL_FIRST_WEEK
    || state.date.week > config.STUD_DEAL_LAST_WEEK) return { ok: false, error: 'outside_deal_window' };
  if (state.stud.leases.some((lease) => lease.stallionId === horseId)) return { ok: false, error: 'leased' };

  const draft = structuredClone(state);
  const target = draft.horses[horseId]!;
  const from = target.status;
  target.status = 'retired';
  draft.stallions[horseId]!.lastSeasonYear = state.date.year;
  target.ownerId = null;
  target.trainerId = null;
  const owner = draft.owners[draft.playerOwnerId];
  if (owner !== undefined) owner.horseIds = owner.horseIds.filter((id) => id !== horseId);
  return {
    ok: true,
    state: draft,
    events: [
      { type: 'horse_status_changed', horseId, from, to: 'retired', date: { ...state.date } },
      { type: 'stallion_pensioned', stallionId: horseId, reason: 'player', date: { ...state.date } },
    ],
  };
}

/** 시즌 기록: 27주 정산 기록이 있으면 그 값, 없으면 AI 예약 수요를 말별 스트림으로 센다. */
function observedSeason(
  state: GameState, stallionId: HorseId, stallion: Stallion, year: number,
): { covers: number; conceptions: number } {
  const settled = state.stud.seasons.find((record) => record.stallionId === stallionId && record.year === year);
  if (settled !== undefined) {
    return { covers: settled.outsideCovers, conceptions: settled.conceptions };
  }
  const covers = stallion.bookedThisSeason;
  const rng = createRng(`${state.initialSeed}:fert-obs:${stallionId}:${year}`);
  let conceptions = 0;
  for (let i = 0; i < covers; i++) {
    if (rng.chance(stallion.fertility)) conceptions++;
  }
  return { covers, conceptions };
}

/** 최근 연속 두 시즌이 모두 미달이면 은퇴(AI·실명·국내 판매)하거나 경고(내 종마)한다. */
function judgeRetirement(state: GameState, stallionId: HorseId, year: number, events: GameEvent[]): void {
  const stallion = state.stallions[stallionId];
  const horse = state.horses[stallionId];
  if (stallion === undefined || horse?.status !== 'stud') return;
  const recent = (stallion.fertilityHistory ?? []).slice(-config.FERTILITY_RETIRE_SEASONS);
  if (recent.length < config.FERTILITY_RETIRE_SEASONS) return;
  if (recent[recent.length - 1]!.year !== year) return;
  for (let i = 1; i < recent.length; i++) {
    if (recent[i]!.year !== recent[i - 1]!.year + 1) return;
  }
  const underHalf = recent.every((season) => season.covers >= config.FERTILITY_MIN_SAMPLE
    && season.conceptions / season.covers < config.FERTILITY_RETIRE_RATE);
  if (!underHalf) return;

  const date = { year, week: config.FERTILITY_RECORD_WEEK };
  if (horse.ownerId === state.playerOwnerId) {
    const sum = observedRate(recent, config.FERTILITY_RETIRE_SEASONS);
    events.push({ type: 'stallion_fertility_warning', stallionId, rate: round(sum.conceptions / sum.covers, 2),
      date: { ...date } });
    return;
  }
  const from = horse.status;
  horse.status = 'retired';
  stallion.lastSeasonYear = year;
  const notable = (stallion.realKey ?? null) !== null
    || state.stud.sales.some((sale) => sale.stallionId === stallionId && sale.mode === 'domestic');
  if (notable) {
    events.push({ type: 'horse_status_changed', horseId: stallionId, from, to: 'retired', date: { ...date } });
    events.push({ type: 'stallion_pensioned', stallionId: stallionId, reason: 'fertility', date: { ...date } });
  }
}

/**
 * 종마 수태율 시스템(id 'stud_fertility').
 * - SUBFERTILE_CHECK_WEEK: 첫 시즌 종마에 저수태 판명(확률·말별 스트림)
 * - FERTILITY_RECORD_WEEK: 시즌 관측 수태 기록을 남기고, 연속 미달이면 은퇴·경고를 판정
 */
export function createStudFertilitySystem(): WeeklySystem {
  return {
    id: 'stud_fertility',
    run(draft, ctx): GameEvent[] {
      const { year, week } = ctx.date;
      const date = { year, week };
      const events: GameEvent[] = [];
      const ids = Object.keys(draft.stallions).sort();

      if (week === config.SUBFERTILE_CHECK_WEEK) {
        for (const id of ids) {
          const stallion = draft.stallions[id]!;
          const horse = draft.horses[id];
          if (horse?.status !== 'stud' || stallion.firstSeasonYear !== year) continue;
          const rng = createRng(`${draft.initialSeed}:subfertile:${id}`);
          if (!rng.chance(config.SUBFERTILE_CHANCE)) continue;
          const span = config.SUBFERTILE_MAX - config.SUBFERTILE_MIN;
          stallion.fertility = round(config.SUBFERTILE_MIN + rng.next() * span, 3);
          if (horse.ownerId === draft.playerOwnerId || (stallion.realKey ?? null) !== null) {
            events.push({ type: 'stallion_subfertile', stallionId: id, fertility: stallion.fertility, date: { ...date } });
          }
        }
      }

      if (week === config.FERTILITY_RECORD_WEEK) {
        for (const id of ids) {
          const stallion = draft.stallions[id]!;
          if (draft.horses[id]?.status !== 'stud' || stallion.bookingSeason !== year) continue;
          if (stallion.leasedAwayUntil != null && year < stallion.leasedAwayUntil) continue;
          const history = stallion.fertilityHistory ?? [];
          if (history.some((season) => season.year === year)) continue;
          const observed = observedSeason(draft, id, stallion, year);
          if (observed.covers === 0) continue;
          stallion.fertilityHistory = [...history, { year, covers: observed.covers,
            conceptions: observed.conceptions }].slice(-config.FERTILITY_HISTORY_LIMIT);
        }
        for (const id of ids) judgeRetirement(draft, id, year, events);
      }
      return events;
    },
  };
}
