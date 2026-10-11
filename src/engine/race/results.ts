import {
  DEAD_HEAT_SECONDS,
  DISTANCE_MARGIN_L,
  FIGURE_DECIMALS,
  HALF_LENGTH_LIMIT_L,
  HEAD_MAX_L,
  LB_PER_LENGTH_TABLE,
  MIN_FIRST_SECTION_M,
  MIN_LENGTH_MARGIN_L,
  NECK_MAX_L,
  NOSE_MAX_L,
  QUARTER_LENGTH_LIMIT_L,
  SECTIONAL_STEP_M,
  SHORT_HEAD_MAX_L,
} from '../config/results';
import { LENGTHS_PER_SECOND } from '../config/going';
import type {
  FinishRecord,
  GameDate,
  Going,
  Margin,
  Race,
  RaceEntry,
  RaceResult,
  RunnerResult,
} from '../types';

/** 구간 표지 위치(m, 오름차순). 결승선에서 1펄롱씩 거슬러 올라간 지점 중 첫 구간이 MIN_FIRST_SECTION_M 이상인 것. */
export function sectionalMarks(distance: number): number[] {
  const marks: number[] = [];
  const kMax = Math.floor(distance / SECTIONAL_STEP_M);
  for (let k = kMax; k >= 1; k--) {
    const m = distance - k * SECTIONAL_STEP_M;
    if (m >= MIN_FIRST_SECTION_M) marks.push(m);
  }
  return marks;
}

/** 거리별 1마신당 lb. 표 선형 보간, 양끝 밖은 끝값. */
export function lbPerLength(distance: number): number {
  const table = LB_PER_LENGTH_TABLE;
  const first = table[0];
  const last = table[table.length - 1];
  if (first === undefined || last === undefined) {
    throw new Error('LB_PER_LENGTH_TABLE 이 비어 있다');
  }
  if (distance <= first[0]) return first[1];
  if (distance >= last[0]) return last[1];
  for (let i = 1; i < table.length; i++) {
    const hi = table[i];
    const lo = table[i - 1];
    if (hi === undefined || lo === undefined) break;
    if (distance <= hi[0]) {
      const [d0, v0] = lo;
      const [d1, v1] = hi;
      return v0 + ((v1 - v0) * (distance - d0)) / (d1 - d0);
    }
  }
  return last[1];
}

/** 착차(마신) → 착차 라벨. deadHeat 이면 동착. */
export function marginFromLengths(lengths: number, deadHeat = false): Margin {
  if (deadHeat) return { label: 'dead_heat', lengths: 0 };
  if (lengths < NOSE_MAX_L) return { label: 'nose', lengths: 0 };
  if (lengths < SHORT_HEAD_MAX_L) return { label: 'short_head', lengths: 0 };
  if (lengths < HEAD_MAX_L) return { label: 'head', lengths: 0 };
  if (lengths < NECK_MAX_L) return { label: 'neck', lengths: 0 };
  if (lengths >= DISTANCE_MARGIN_L) return { label: 'distance', lengths: 0 };

  let rounded: number;
  if (lengths < QUARTER_LENGTH_LIMIT_L) {
    rounded = Math.round(lengths * 4) / 4;
  } else if (lengths < HALF_LENGTH_LIMIT_L) {
    rounded = Math.round(lengths * 2) / 2;
  } else {
    rounded = Math.round(lengths);
  }
  if (rounded < MIN_LENGTH_MARGIN_L) rounded = MIN_LENGTH_MARGIN_L;
  return { label: 'lengths', lengths: rounded };
}

const FRACTION_CHARS = ['', '¼', '½', '¾'] as const;

/** 마신 수를 정수부 + 분수 문자로 표기. 0.5 → '½', 1.25 → '1¼', 3 → '3' */
function formatLengths(lengths: number): string {
  const quarters = Math.round(lengths * 4);
  const whole = Math.floor(quarters / 4);
  const rem = quarters - whole * 4;
  const frac = FRACTION_CHARS[rem] ?? '';
  if (whole === 0 && rem === 0) return '0';
  if (whole === 0) return frac;
  return `${whole}${frac}`;
}

/** 착차 영문 약어 */
export function formatMargin(m: Margin): string {
  switch (m.label) {
    case 'dead_heat':
      return 'dh';
    case 'nose':
      return 'nse';
    case 'short_head':
      return 'shd';
    case 'head':
      return 'hd';
    case 'neck':
      return 'nk';
    case 'distance':
      return 'dist';
    case 'lengths':
      return formatLengths(m.lengths);
  }
}

/** 착차 한국어 표기 */
export function formatMarginKo(m: Margin): string {
  switch (m.label) {
    case 'dead_heat':
      return '동착';
    case 'nose':
      return '코';
    case 'short_head':
      return '짧은머리';
    case 'head':
      return '머리';
    case 'neck':
      return '목';
    case 'distance':
      return '대차';
    case 'lengths':
      return `${formatLengths(m.lengths)}마신`;
  }
}

function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  const r = Math.round(value * f) / f;
  return r === 0 ? 0 : r;
}

function getEntry(entries: readonly RaceEntry[], index: number): RaceEntry {
  const entry = entries[index];
  if (entry === undefined) throw new Error(`runnerIndex ${index} 에 해당하는 출주 정보가 없다`);
  return entry;
}

/** 시뮬레이터 원시 기록을 RaceResult 로 변환한다. */
export function buildRaceResult(args: {
  race: Race;
  going: Going;
  date: GameDate;
  seed: number;
  entries: readonly RaceEntry[];
  finishes: readonly FinishRecord[];
  marks: readonly number[];
}): RaceResult {
  const { race, going, date, seed, entries, finishes, marks } = args;
  const n = entries.length;

  if (finishes.length !== n) {
    throw new Error(`finishes 개수(${finishes.length})가 출주 두수(${n})와 다르다`);
  }
  const seen: boolean[] = new Array<boolean>(n).fill(false);
  for (const f of finishes) {
    const idx = f.runnerIndex;
    if (!Number.isInteger(idx) || idx < 0 || idx >= n) {
      throw new Error(`잘못된 runnerIndex: ${idx}`);
    }
    if (seen[idx] === true) throw new Error(`중복된 runnerIndex: ${idx}`);
    seen[idx] = true;
  }

  const sorted = [...finishes].sort((a, b) => {
    const dt = a.finishTime - b.finishTime;
    if (dt !== 0) return dt;
    return getEntry(entries, a.runnerIndex).saddleCloth - getEntry(entries, b.runnerIndex).saddleCloth;
  });

  const lps = LENGTHS_PER_SECOND[going];
  const winner = sorted[0];
  if (winner === undefined) throw new Error('출주 두수가 0이다');
  const winningTime = winner.finishTime;
  const winnerWeight = getEntry(entries, winner.runnerIndex).weightLb;
  const lbPer = lbPerLength(race.distance);

  const placed: { position: number; margin: Margin | null }[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const rec = sorted[i];
    if (rec === undefined) continue;
    if (i === 0) {
      placed.push({ position: 1, margin: null });
      continue;
    }
    const prev = sorted[i - 1];
    const prevPlaced = placed[i - 1];
    if (prev === undefined || prevPlaced === undefined) continue;
    const dt = rec.finishTime - prev.finishTime;
    if (dt <= DEAD_HEAT_SECONDS) {
      placed.push({
        position: prevPlaced.position,
        margin: prevPlaced.margin === null ? null : marginFromLengths(0, true),
      });
    } else {
      placed.push({
        position: i + 1,
        margin: marginFromLengths(dt * lps),
      });
    }
  }

  const runners: RunnerResult[] = sorted.map((rec: FinishRecord, i: number) => {
    const entry = getEntry(entries, rec.runnerIndex);
    const pl = placed[i];
    if (pl === undefined) throw new Error('착순 계산 실패');
    const beatenLengths = (rec.finishTime - winningTime) * lps;
    const sectionals = buildSectionals(rec, marks);
    const raw = -(beatenLengths * lbPer) + (entry.weightLb - winnerWeight);
    return {
      runnerIndex: rec.runnerIndex,
      horseId: entry.horseId,
      saddleCloth: entry.saddleCloth,
      draw: entry.draw,
      jockeyId: entry.jockeyId,
      weightLb: entry.weightLb,
      position: pl.position,
      finishTime: rec.finishTime,
      margin: pl.margin,
      beatenLengths,
      sectionals,
      performanceFigure: roundTo(raw, FIGURE_DECIMALS),
      odds: entry.odds === null ? null : { num: entry.odds.num, den: entry.odds.den },
    };
  });

  return {
    raceId: race.id,
    racecourseId: race.racecourseId,
    date: { year: date.year, week: date.week },
    going,
    distance: race.distance,
    seed,
    winningTime,
    sectionalMarks: [...marks],
    runners,
  };
}

/** 구간 타임 [t1, t2-t1, …, finishTime - tk]. 표지가 없으면 [finishTime]. */
function buildSectionals(rec: FinishRecord, marks: readonly number[]): number[] {
  if (marks.length === 0) return [rec.finishTime];
  if (rec.markTimes.length !== marks.length) {
    throw new Error(
      `markTimes 개수(${rec.markTimes.length})가 표지 개수(${marks.length})와 다르다 (runnerIndex ${rec.runnerIndex})`,
    );
  }
  const out: number[] = [];
  let prev = 0;
  for (const t of rec.markTimes) {
    out.push(t - prev);
    prev = t;
  }
  out.push(rec.finishTime - prev);
  return out;
}
