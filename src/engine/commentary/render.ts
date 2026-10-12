import {
  CAME_FROM_BACK_RANK_FRACTION,
  FADED_FINISH_MIN_POSITION,
  FADED_TURN_IN_MAX_RANK,
  MIDDLE_RANK_FRACTION,
  PACE_CHECK_FRACTION,
  PLACED_MAX_POSITION,
  STAYED_ON_MIN_PLACES,
  VALUE_ROUND_FACTOR,
  VERDICT_SAMPLE_TICKS,
  WINNER_EASY_MIN_LENGTHS,
} from '../config/commentary';
import { formatMarginKo as formatRaceMarginKo } from '../race/results';
import { createRng } from '../rng';
import type { Margin, RaceReplay, RaceResult } from '../types';
import {
  earlyPointM,
  frameAt,
  rankOf,
  snapshotAtReach,
  turnInPointM,
  valueAt,
  type CommentaryEvent,
  type CommentaryPath,
} from './events';

/** 문장 틀. 키 = 사건 키(lineKeyOf) 또는 한 줄 평 키. 자리 표시: {horse}, {horse2}, {n}, {margin} */
export type CommentaryLines = Record<string, string[]>;

export interface CommentaryLine {
  t: number;
  text: string;
}

export interface VerdictArgs {
  replay: RaceReplay;
  result: RaceResult;
  /** runner index 순 이름 */
  names: readonly string[];
  seed: number;
  lines: CommentaryLines;
  path: CommentaryPath;
}

/** 사건의 문장 키. pace 는 빠름/느림을 나눠 쓴다(pace_fast / pace_slow). */
export function lineKeyOf(ev: CommentaryEvent): string {
  if (ev.kind === 'pace') return (ev.value ?? 0) > 0 ? 'pace_fast' : 'pace_slow';
  return ev.kind;
}

/** {n} 표기. 소수 한 자리까지 반올림하고 뒤의 0 은 뺀다. */
function formatValue(v: number): string {
  return String(Math.round(v * VALUE_ROUND_FACTOR) / VALUE_ROUND_FACTOR);
}

/** 착차 한국어 표기. 짧은 머리만 띄어 쓴다. 나머지(코·머리·목·대차·동착·N마신)는 race/results.formatMarginKo 와 같다. */
export function formatMarginKo(m: Margin): string {
  return formatRaceMarginKo(m);
}

/** 2착 착차가 null 이면 동착(승자와 같은 착순). */
const DEAD_HEAT_MARGIN: Margin = { label: 'dead_heat', lengths: 0 };

/** {margin} 에 넣을 2착 착차. 결과가 없으면 던진다. */
function secondMarginOf(result: RaceResult | undefined, template: string): Margin {
  if (result === undefined) throw new Error(`commentary: {margin} 에 넣을 결과가 없다 (${template})`);
  const second = result.runners[1];
  if (second === undefined) throw new Error(`commentary: {margin} 에 넣을 2착이 없다 (${template})`);
  return second.margin ?? DEAD_HEAT_MARGIN;
}

/** 자리 표시 치환. horses[0] = {horse}, horses[1] = {horse2}. {margin} 은 result 의 2착 착차. */
function fillTemplate(
  template: string,
  horses: readonly number[],
  names: readonly string[],
  value: number | undefined,
  result?: RaceResult,
): string {
  return template.replace(/\{(horse2?|n|margin)\}/g, (_match: string, key: string) => {
    if (key === 'n') {
      if (value === undefined) throw new Error(`commentary: {n} 에 넣을 값이 없다 (${template})`);
      return formatValue(value);
    }
    if (key === 'margin') return formatMarginKo(secondMarginOf(result, template));
    const idx = key === 'horse' ? horses[0] : horses[1];
    const name = idx === undefined ? undefined : names[idx];
    if (name === undefined) throw new Error(`commentary: {${key}} 에 대응하는 말이 없다 (${template})`);
    return name;
  });
}

function linesFor(lines: CommentaryLines, key: string): readonly string[] {
  const list = lines[key];
  if (list === undefined || list.length === 0) throw new Error(`commentary: 문장이 없다 (${key})`);
  return list;
}

/**
 * 사건을 한국어 자막 문장으로 바꾼다. 같은 seed = 같은 문장.
 * 같은 키가 연달아 나오면 직전과 다른 후보를 고른다.
 * result 는 {margin}(2착 착차)을 쓰는 문장이 있을 때만 필요하다.
 */
export function renderCommentary(
  events: readonly CommentaryEvent[],
  names: readonly string[],
  seed: number,
  lines: CommentaryLines,
  result?: RaceResult,
): CommentaryLine[] {
  const rng = createRng('commentary:' + seed);
  let prevKey: string | null = null;
  let prevIdx = -1;
  return events.map((ev) => {
    const key = lineKeyOf(ev);
    const list = linesFor(lines, key);
    let idx: number;
    if (key === prevKey && list.length > 1) {
      // 직전 후보(prevIdx)를 뺀 나머지에서 고른다
      const k = rng.int(0, list.length - 2);
      idx = k >= prevIdx ? k + 1 : k;
    } else {
      idx = rng.int(0, list.length - 1);
    }
    prevKey = key;
    prevIdx = idx;
    const chosen = list[idx];
    if (chosen === undefined) throw new Error(`commentary: 문장 선택 실패 (${key})`);
    return { t: ev.t, text: fillTemplate(chosen, ev.horses, names, ev.value, result) };
  });
}

/**
 * 말별 레이스 후 한 줄 평. 출주마 전원에게 한 문장씩 준다.
 * 판정 순서: 1착(400m 선두면 made_all, 아니면 winner_easy/narrow) → came_from_back → faded → stayed_on → never_dangerous → ran_to_form.
 */
export function horseVerdicts(args: VerdictArgs): Record<number, string> {
  const { replay, result, names, seed, lines, path } = args;
  const frames = replay.frames;
  const n = replay.horseIds.length;
  const out: Record<number, string> = {};
  if (n === 0) return out;

  const distance = result.distance;
  const winnerTime = result.winningTime;
  const early = snapshotAtReach(frames, n, earlyPointM(distance));
  const half = snapshotAtReach(frames, n, distance * PACE_CHECK_FRACTION);
  const turn = snapshotAtReach(frames, n, turnInPointM(distance, path.homeStraightLength));
  const rankHalf = half === null ? null : rankOf(half.prog);
  const rankTurn = turn === null ? null : rankOf(turn.prog);

  // 중위 이상(rank ≤ n × MIDDLE_RANK_FRACTION)을 한 번이라도 찍었는지. 초반 선두 지점 이후, 결승 전 샘플만 본다.
  const dangerous = new Set<number>();
  const sampleFromT = early?.t ?? 0;
  for (let f = 0; f < frames.length; f += VERDICT_SAMPLE_TICKS) {
    const frame = frameAt(frames, f);
    if (frame.t < sampleFromT || frame.t > winnerTime) continue;
    for (let i = 0; i < n; i++) {
      const pi = valueAt(frame.progress, i);
      let rank = 1;
      for (let j = 0; j < n; j++) {
        if (valueAt(frame.progress, j) > pi) rank++;
      }
      if (rank <= n * MIDDLE_RANK_FRACTION) dangerous.add(i);
    }
  }

  const winnerLengths = result.runners[1]?.beatenLengths ?? 0;
  const rng = createRng('commentary-verdict:' + seed);

  for (const r of result.runners) {
    const i = r.runnerIndex;
    const p = r.position;
    let key: string;
    let value: number | undefined;
    if (p === 1) {
      if (early !== null && early.order[0] === i) {
        key = 'made_all';
      } else {
        value = winnerLengths;
        key = winnerLengths >= WINNER_EASY_MIN_LENGTHS ? 'winner_easy' : 'winner_narrow';
      }
    } else if (half !== null && rankHalf !== null && valueAt(rankHalf, i) > n * CAME_FROM_BACK_RANK_FRACTION && p <= PLACED_MAX_POSITION) {
      key = 'came_from_back';
    } else if (turn !== null && rankTurn !== null && valueAt(rankTurn, i) <= FADED_TURN_IN_MAX_RANK && p >= FADED_FINISH_MIN_POSITION) {
      key = 'faded';
    } else if (turn !== null && rankTurn !== null && valueAt(rankTurn, i) - p >= STAYED_ON_MIN_PLACES) {
      key = 'stayed_on';
    } else if (!dangerous.has(i) && p > PLACED_MAX_POSITION) {
      key = 'never_dangerous';
    } else {
      key = 'ran_to_form';
    }
    const list = linesFor(lines, key);
    const template = list[rng.int(0, list.length - 1)];
    if (template === undefined) throw new Error(`commentary: 한 줄 평 선택 실패 (${key})`);
    out[i] = fillTemplate(template, [i], names, value);
  }
  return out;
}
