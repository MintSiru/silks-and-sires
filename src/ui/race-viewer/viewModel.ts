/**
 * 레이스 띠 뷰어의 순수 계산 모듈. DOM 을 쓰지 않는다.
 * 그리기는 stripRenderer.ts 가 담당한다.
 */
import type {
  Going,
  HexColor,
  PathPoint,
  RaceEntry,
  RaceGrade,
  RacePath,
  RaceReplay,
  RaceResult,
  ReplayFrame,
  Surface,
} from '../../engine/types';
import { formatMarginKo, marginFromLengths } from '../../engine/race/results';
import { formatOdds } from '../../engine/race/odds';
import { goingLabel } from '../../engine/going/going';
import { SECTIONAL_STEP_M } from '../../engine/config/results';
import { timeToReach } from '../../engine/commentary/events';

// ── UI 상수 (밸런스 상수가 아닌 표시 상수) ─────────────────────────────
/** 착차 환산에 쓰는 마신 길이(m). 선두와 progress 차를 마신으로 바꾼다. */
const LENGTH_M = 2.4;
/** 1펄롱(m). 구간 표지 간격과 같다(SECTIONAL_STEP_M). */
const FURLONG_M = SECTIONAL_STEP_M;
/** 고저 단면 샘플 간격(m) */
const PROFILE_STEP_M = 20;
/** 고저 단면 세로 축 최소 범위(m). 이보다 완만한 경로도 이 범위로 그려 과장되지 않게 한다. */
const PROFILE_MIN_RANGE_M = 10;
/** 좌측 패널 고저 단면 띠 높이(px) */
export const PROFILE_H = 36;
/** 좌측 패널 바깥 여백(px). stripRenderer 의 PANEL_PAD 와 같다. */
export const LEFT_PAD = 10;
/** 구간 기록 소수 자릿수 */
const SPLIT_DECIMALS = 1;
/** 카메라 창의 최소 폭(m) */
const CAMERA_MIN_SPAN_M = 30;
/** 카메라 창 여백 비율(폭 대비) */
const CAMERA_PADDING_RATIO = 0.08;
/** 선두가 결승까지 이 거리(m) 이내면 결승 모드 카메라 */
const CAMERA_FINAL_ZOOM_M = 200;
/** 결승 모드에서 trailer 를 고를 상위 두수 */
const CAMERA_FINAL_GROUP = 4;
/** 원판 반지름(px) */
export const DISC_RADIUS = 13;
/** 겹친 뒤쪽 원판의 투명도 */
const OVERLAP_ALPHA = 0.55;
/** 중앙 띠 배경색 */
export const STRIP_BG = '#1d2733';
/** 원판 색과 띠 배경의 대비가 이 값 미만이면 흰 테두리 */
const LOW_CONTRAST_RATIO = 1.6;
/** 좌측 패널 폭(px) */
const LEFT_PANEL_W = 250;
/** 우측 패널 폭(px) */
const RIGHT_PANEL_W = 290;
/** 3착 통과 후 사진 판정 표시 시간(s) */
const PHOTO_HOLD_S = 2;
/** m/s → km/h */
const KMH_PER_MPS = 3.6;

// ── 타입 ───────────────────────────────────────────────────────────────
export interface ViewerInfo {
  raceName: string;
  grade: RaceGrade | null;
  courseName: string;
  surface: Surface;
  distance: number;
  going: Going;
  /** index = runner index */
  entries: RaceEntry[];
  /** index = runner index */
  horseNames: string[];
}

export interface CameraWindow {
  from: number;
  to: number;
}

export interface StandingRow {
  runnerIndex: number;
  saddleCloth: number;
  silksPrimary: HexColor;
  horseName: string;
  marginText: string;
  oddsText: string;
}

export interface DiscPlacement {
  runnerIndex: number;
  x: number;
  y: number;
  fill: HexColor;
  textColor: string;
  border: HexColor;
  label: string;
  isPlayer: boolean;
  alpha: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface StripModel {
  width: number;
  height: number;
  left: {
    layout: PathPoint[];
    race: PathPoint[];
    leader: PathPoint;
    distanceLabel: string;
    goingLabel: string;
    remainingLabel: string;
    speedLabel: string;
    /** 고저 단면. 좌표는 strip 전체 기준(좌측 패널 하단 띠 안). marker = 선두 위치 */
    profile: { points: { x: number; y: number }[]; marker: { x: number; y: number } };
  };
  center: {
    rect: Rect;
    discs: DiscPlacement[];
    poles: { x: number; label: string }[];
    finishX: number | null;
    /** 선두가 지난 마지막 펄롱 구간 시간("12.6s"). 첫 구간을 다 지나기 전이면 null */
    split: string | null;
  };
  right: {
    rows: StandingRow[];
    raceName: string;
    gradeBadge: string | null;
    courseName: string;
    finished: boolean;
    photo: boolean;
  };
}

// ── 리플레이 보간 ─────────────────────────────────────────────────────
function copyFrame(f: ReplayFrame, t: number): ReplayFrame {
  return { t, progress: [...f.progress], lane: [...f.lane], speed: [...f.speed] };
}

/** 마지막 프레임 시각(s). 프레임이 없으면 RangeError. */
export function replayDuration(replay: RaceReplay): number {
  const last = replay.frames[replay.frames.length - 1];
  if (last === undefined) throw new RangeError('replayDuration: 프레임이 없다');
  return last.t;
}

/**
 * t 시점의 프레임. t 는 [0, duration] 으로 clamp 하고 인접 두 프레임을 선형 보간한다.
 * 반환은 새 객체이며 replay 를 바꾸지 않는다.
 */
export function frameAt(replay: RaceReplay, t: number): ReplayFrame {
  const frames = replay.frames;
  const first = frames[0];
  const last = frames[frames.length - 1];
  if (first === undefined || last === undefined) throw new RangeError('frameAt: 프레임이 없다');
  const duration = last.t;
  // NaN 은 0 으로 취급
  const tc = t > 0 ? Math.min(t, duration) : 0;
  if (tc <= first.t) return copyFrame(first, tc);
  if (tc >= duration) return copyFrame(last, tc);

  // 이분 탐색: frames[lo].t <= tc < frames[lo + 1].t
  let lo = 0;
  let hi = frames.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    const fm = frames[mid];
    if (fm !== undefined && fm.t <= tc) lo = mid;
    else hi = mid;
  }
  const f0 = frames[lo];
  const f1 = frames[hi];
  if (f0 === undefined || f1 === undefined) throw new RangeError('frameAt: 프레임 인덱스 오류');
  const span = f1.t - f0.t;
  const a = span > 0 ? (tc - f0.t) / span : 0;
  const lerp = (p: number, q: number): number => p + (q - p) * a;
  return {
    t: tc,
    progress: f0.progress.map((p, i) => lerp(p, f1.progress[i] ?? p)),
    lane: f0.lane.map((p, i) => lerp(p, f1.lane[i] ?? p)),
    speed: f0.speed.map((p, i) => lerp(p, f1.speed[i] ?? p)),
  };
}

// ── 순위 헬퍼 ─────────────────────────────────────────────────────────
function requireEntry(info: ViewerInfo, index: number): RaceEntry {
  const entry = info.entries[index];
  if (entry === undefined) throw new RangeError(`출주 정보 없음 (runnerIndex ${index})`);
  return entry;
}

function horseNameOf(info: ViewerInfo, index: number): string {
  const name = info.horseNames[index];
  if (name === undefined) throw new RangeError(`말 이름 없음 (runnerIndex ${index})`);
  return name;
}

function leaderIndexOf(progress: readonly number[]): number {
  if (progress.length === 0) throw new RangeError('progress 가 비어 있다');
  let best = 0;
  for (let i = 1; i < progress.length; i++) {
    if ((progress[i] ?? -Infinity) > (progress[best] ?? -Infinity)) best = i;
  }
  return best;
}

// ── 카메라 ────────────────────────────────────────────────────────────
/**
 * 카메라 창. 선두가 결승 CAMERA_FINAL_ZOOM_M 이내(결승 전)이면 상위 CAMERA_FINAL_GROUP 두의
 * 최소 progress 를 trailer 로, 아니면 전체 최소 progress 를 쓴다.
 */
export function cameraWindow(frame: ReplayFrame, distance: number): CameraWindow {
  const progress = frame.progress;
  if (progress.length === 0) throw new RangeError('cameraWindow: progress 가 비어 있다');
  const leader = progress[leaderIndexOf(progress)] ?? 0;
  const toLeader = distance - leader;

  let trailer: number;
  if (toLeader > 0 && toLeader <= CAMERA_FINAL_ZOOM_M) {
    const top = [...progress].sort((a, b) => b - a).slice(0, CAMERA_FINAL_GROUP);
    trailer = Math.min(...top);
  } else {
    trailer = Math.min(...progress);
  }

  // span 을 가운데 기준으로 펼친다. 최소 폭이 적용되지 않으면 from = trailer - pad, to = leader + pad 와 같다.
  const span = Math.max(CAMERA_MIN_SPAN_M, leader - trailer);
  const pad = span * CAMERA_PADDING_RATIO + LENGTH_M;
  const mid = (leader + trailer) / 2;
  const half = span / 2 + pad;
  return { from: mid - half, to: mid + half };
}

// ── 순위표 ────────────────────────────────────────────────────────────
/** progress 내림차순(같으면 마번 오름차순) 으로 runner index 배열을 만든다. */
function orderByProgress(progress: readonly number[], info: ViewerInfo): number[] {
  const idx = progress.map((_, i) => i);
  idx.sort((a, b) => {
    const dp = (progress[b] ?? 0) - (progress[a] ?? 0);
    if (dp !== 0) return dp;
    return requireEntry(info, a).saddleCloth - requireEntry(info, b).saddleCloth;
  });
  return idx;
}

/** 실시간 순위 상위 count 두. 착차는 직전 말과의 progress 차 / LENGTH_M. */
export function liveStandings(frame: ReplayFrame, info: ViewerInfo, count = 3): StandingRow[] {
  const order = orderByProgress(frame.progress, info).slice(0, count);
  const rows: StandingRow[] = [];
  let prevIndex: number | undefined;
  for (const runnerIndex of order) {
    const entry = requireEntry(info, runnerIndex);
    let marginText = '선두';
    if (prevIndex !== undefined) {
      const gap =
        ((frame.progress[prevIndex] ?? 0) - (frame.progress[runnerIndex] ?? 0)) / LENGTH_M;
      marginText = formatMarginKo(marginFromLengths(gap));
    }
    rows.push({
      runnerIndex,
      saddleCloth: entry.saddleCloth,
      silksPrimary: entry.silks.primary,
      horseName: horseNameOf(info, runnerIndex),
      marginText,
      oddsText: entry.odds === null ? '-' : formatOdds(entry.odds),
    });
    prevIndex = runnerIndex;
  }
  return rows;
}

/** 확정 결과 상위 count 두. result.runners 순서를 따른다. */
export function finalStandings(result: RaceResult, info: ViewerInfo, count = 3): StandingRow[] {
  return result.runners.slice(0, count).map((rr) => {
    const entry = requireEntry(info, rr.runnerIndex);
    let marginText: string;
    if (rr.position === 1) marginText = '1착';
    else if (rr.margin === null) marginText = '동착';
    else marginText = formatMarginKo(rr.margin);
    return {
      runnerIndex: rr.runnerIndex,
      saddleCloth: rr.saddleCloth,
      silksPrimary: entry.silks.primary,
      horseName: horseNameOf(info, rr.runnerIndex),
      marginText,
      oddsText: rr.odds === null ? '-' : formatOdds(rr.odds),
    };
  });
}

// ── 색 ────────────────────────────────────────────────────────────────
function parseHex(hex: HexColor): [number, number, number] {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (m === null || m[1] === undefined) throw new RangeError(`잘못된 색 값: ${hex}`);
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

function channelLinear(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG sRGB 상대 휘도 */
export function relativeLuminance(hex: HexColor): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channelLinear(r) + 0.7152 * channelLinear(g) + 0.0722 * channelLinear(b);
}

/** WCAG 대비비 (1 ~ 21) */
export function contrastRatio(a: HexColor, b: HexColor): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** 배경 위 글자색. 흰 글자 대비가 검은 글자 대비보다 크면 흰색, 아니면 검은색. */
export function textColorFor(bg: HexColor): '#000000' | '#ffffff' {
  const white = contrastRatio(bg, '#ffffff');
  const black = contrastRatio(bg, '#000000');
  return white > black ? '#ffffff' : '#000000';
}

/** 원판 테두리색. 띠 배경과 대비가 낮으면 흰색. */
export function discBorderFor(fill: HexColor): HexColor {
  return contrastRatio(fill, STRIP_BG) < LOW_CONTRAST_RATIO ? '#ffffff' : '#000000';
}

// ── 표기 ──────────────────────────────────────────────────────────────
/** 펄롱 수를 0.5 단위로 반올림한 표기. 8 → '8', 5.5 → '5½', 0 → '½' */
function furlongCountText(furlongs: number): string {
  const r = Math.round(furlongs * 2) / 2;
  if (r === 0) return '½';
  const whole = Math.floor(r);
  return r - whole >= 0.5 ? `${whole}½` : `${whole}`;
}

function thousands(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 'TURF 1,600m (8f)', 'AW 1,207m (6f)', 'TURF 1,100m (5½f)' */
export function formatDistanceLabel(surface: Surface, distance: number): string {
  return `${surface.toUpperCase()} ${thousands(distance)}m (${furlongCountText(distance / FURLONG_M)}f)`;
}

/** 남은 거리 표기. 결승 통과 후는 '결승'. */
export function formatRemaining(toFinish: number): string {
  if (toFinish <= 0) return '결승';
  return `${furlongCountText(toFinish / FURLONG_M)}f`;
}

/** m/s → km/h 정수 */
export function speedKmh(mps: number): number {
  return Math.round(mps * KMH_PER_MPS);
}

// ── 원판 배치 ─────────────────────────────────────────────────────────
/**
 * 원판 배치. x 는 카메라 창 기준, y 는 lane 기준(0 = 아래쪽 내측 레일).
 * progress 오름차순으로 반환하며, 자기보다 앞쪽(progress 가 큰) 원판과 2·DISC_RADIUS 이내면 alpha 를 낮춘다.
 */
export function placeDiscs(
  frame: ReplayFrame,
  win: CameraWindow,
  info: ViewerInfo,
  rect: Rect,
  trackWidth: number,
): DiscPlacement[] {
  if (!(trackWidth > 0)) throw new RangeError(`trackWidth 는 0보다 커야 한다 (${trackWidth})`);
  const span = win.to - win.from;
  const usableH = rect.h - 2 * DISC_RADIUS;

  const base = frame.progress.map((p, runnerIndex) => {
    const lane = frame.lane[runnerIndex] ?? 0;
    const x = rect.x + ((p - win.from) / span) * rect.w;
    const y = rect.y + rect.h - DISC_RADIUS - (lane / trackWidth) * usableH;
    return { runnerIndex, progress: p, x, y };
  });
  base.sort((a, b) => a.progress - b.progress || a.runnerIndex - b.runnerIndex);

  const minDist = 2 * DISC_RADIUS;
  return base.map((d, k) => {
    const overlapped = base.some((o, j) => {
      if (j <= k || !(o.progress > d.progress)) return false;
      return Math.hypot(o.x - d.x, o.y - d.y) < minDist;
    });
    const entry = requireEntry(info, d.runnerIndex);
    const fill = entry.silks.primary;
    return {
      runnerIndex: d.runnerIndex,
      x: d.x,
      y: d.y,
      fill,
      textColor: textColorFor(fill),
      border: discBorderFor(fill),
      label: String(entry.saddleCloth),
      isPlayer: entry.isPlayer,
      alpha: overlapped ? OVERLAP_ALPHA : 1,
    };
  });
}

// ── 고저 단면 · 구간 기록 ─────────────────────────────────────────────
/** 좌측 패널 하단 고저 단면 띠 사각형(strip 좌표). 아래쪽 여백 LEFT_PAD. */
export function profileRect(height: number): Rect {
  return { x: LEFT_PAD, y: height - LEFT_PAD - PROFILE_H, w: LEFT_PANEL_W - 2 * LEFT_PAD, h: PROFILE_H };
}

/**
 * 경로 고저 단면. gradient(= 상승 / 길이)를 거리에 대해 사다리꼴 적분한 상대 높이(m), 출발점 h = 0.
 * 마지막 점의 s 는 distance. 평탄 경로는 모든 h 가 0 이다.
 */
export function elevationProfile(
  path: RacePath,
  distance: number,
  stepM = PROFILE_STEP_M,
): { s: number; h: number }[] {
  if (!(distance > 0)) throw new RangeError(`elevationProfile: distance 는 0보다 커야 한다 (${distance})`);
  if (!(stepM > 0)) throw new RangeError(`elevationProfile: stepM 은 0보다 커야 한다 (${stepM})`);
  const out: { s: number; h: number }[] = [{ s: 0, h: 0 }];
  let prevS = 0;
  let prevG = path.sample(0).gradient;
  let h = 0;
  while (prevS < distance) {
    const s = Math.min(prevS + stepM, distance);
    const g = path.sample(s).gradient;
    h += ((prevG + g) / 2) * (s - prevS);
    out.push({ s, h: h === 0 ? 0 : h });
    prevS = s;
    prevG = g;
  }
  return out;
}

/**
 * 구간 표지 위치(m, 오름차순): distance − k·SECTIONAL_STEP_M (양수인 것) 과 결승선 distance.
 * 첫 표지 앞 구간은 1펄롱이 안 되므로 구간 기록은 표지 사이에서만 난다.
 */
export function sectionBoundaries(distance: number): number[] {
  const out: number[] = [];
  for (let k = Math.floor(distance / FURLONG_M); k >= 1; k--) {
    const m = distance - k * FURLONG_M;
    if (m > 0) out.push(m);
  }
  out.push(distance);
  return out;
}

/** 어느 주자든 처음 진행도 s 에 닿는 시각(s). 아무도 닿지 않으면 null. */
export function firstReachTime(replay: RaceReplay, s: number): number | null {
  let best: number | null = null;
  const n = replay.horseIds.length;
  for (let i = 0; i < n; i++) {
    const ti = timeToReach(replay.frames, i, s);
    if (ti !== null && (best === null || ti < best)) best = ti;
  }
  return best;
}

/**
 * 선두(leaderProgress)가 지난 마지막 표지 구간의 시간. 두 표지 사이 시각 차를 "12.6s" 로 준다.
 * 아직 표지 두 개(첫 구간)를 넘지 못했으면 null.
 */
export function sectionSplit(replay: RaceReplay, distance: number, leaderProgress: number): string | null {
  const marks = sectionBoundaries(distance);
  let j = -1;
  for (let k = 0; k < marks.length; k++) {
    if ((marks[k] ?? Infinity) <= leaderProgress) j = k;
  }
  if (j < 1) return null;
  const tEnd = firstReachTime(replay, marks[j] ?? 0);
  const tStart = firstReachTime(replay, marks[j - 1] ?? 0);
  if (tEnd === null || tStart === null) return null;
  return `${(tEnd - tStart).toFixed(SPLIT_DECIMALS)}s`;
}

/** 고저 단면(s 오름차순)에서 진행도 s 의 높이를 선형 보간한다. */
function heightAt(profile: readonly { s: number; h: number }[], s: number): number {
  for (let k = 1; k < profile.length; k++) {
    const a = profile[k - 1];
    const b = profile[k];
    if (a === undefined || b === undefined) continue;
    if (s <= b.s) {
      const span = b.s - a.s;
      return span > 0 ? a.h + ((b.h - a.h) * (s - a.s)) / span : b.h;
    }
  }
  return profile[profile.length - 1]?.h ?? 0;
}

/** 고저 단면을 띠 사각형에 맞춘 좌표와 선두 위치. 세로는 최소 범위를 두고 가운데에 맞춘다. */
function profileGeometry(
  profile: readonly { s: number; h: number }[],
  band: Rect,
  distance: number,
  leaderProgress: number,
): StripModel['left']['profile'] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of profile) {
    if (p.h < lo) lo = p.h;
    if (p.h > hi) hi = p.h;
  }
  const mid = (lo + hi) / 2;
  const range = Math.max(hi - lo, PROFILE_MIN_RANGE_M);
  const xOf = (s: number): number => band.x + (s / distance) * band.w;
  const yOf = (h: number): number => band.y + band.h / 2 - ((h - mid) / range) * band.h;
  const s = Math.min(Math.max(leaderProgress, 0), distance);
  return {
    points: profile.map((p) => ({ x: xOf(p.s), y: yOf(p.h) })),
    marker: { x: xOf(s), y: yOf(heightAt(profile, s)) },
  };
}

// ── 모델 ──────────────────────────────────────────────────────────────
function gradeBadgeOf(grade: RaceGrade | null): string | null {
  if (grade === null) return null;
  return grade === 'L' ? 'Listed' : grade;
}

/** 한 시점의 화면 모델. 순수 계산. */
export function buildStripModel(args: {
  replay: RaceReplay;
  t: number;
  path: RacePath;
  info: ViewerInfo;
  result: RaceResult;
  width: number;
  height: number;
}): StripModel {
  const { replay, t, path, info, result, width, height } = args;
  const frame = frameAt(replay, t);
  const distance = info.distance;

  // 좌측
  const leaderIdx = leaderIndexOf(frame.progress);
  const leaderProgress = frame.progress[leaderIdx] ?? 0;
  const leaderSpeed = frame.speed[leaderIdx] ?? 0;

  // 중앙
  const rect: Rect = {
    x: LEFT_PANEL_W,
    y: 0,
    w: width - LEFT_PANEL_W - RIGHT_PANEL_W,
    h: height,
  };
  const win = cameraWindow(frame, distance);
  const discs = placeDiscs(frame, win, info, rect, path.width);
  const winSpan = win.to - win.from;
  const xOf = (progress: number): number => rect.x + ((progress - win.from) / winSpan) * rect.w;

  const poles: { x: number; label: string }[] = [];
  for (let k = 1; ; k++) {
    const p = distance - k * FURLONG_M;
    if (p < 0) break;
    if (p >= win.from && p <= win.to) poles.push({ x: xOf(p), label: `${k}f` });
  }
  const finishX = distance >= win.from && distance <= win.to ? xOf(distance) : null;
  const profile = profileGeometry(
    elevationProfile(path, distance),
    profileRect(height),
    distance,
    leaderProgress,
  );
  const split = sectionSplit(replay, distance, leaderProgress);

  // 우측
  const runners = result.runners;
  const last = runners[runners.length - 1];
  if (last === undefined) throw new RangeError('buildStripModel: 결과에 주자가 없다');
  const third = runners[2] ?? last;
  const finished = frame.t >= third.finishTime;
  const second = runners[1];
  const photo =
    finished &&
    second !== undefined &&
    (second.margin === null ||
      second.margin.label === 'nose' ||
      second.margin.label === 'short_head') &&
    frame.t < third.finishTime + PHOTO_HOLD_S;

  return {
    width,
    height,
    left: {
      layout: path.layoutPolyline,
      race: path.racePolyline,
      leader: path.sample(leaderProgress).point,
      distanceLabel: formatDistanceLabel(info.surface, distance),
      goingLabel: goingLabel(info.going),
      remainingLabel: formatRemaining(distance - leaderProgress),
      speedLabel: `${speedKmh(leaderSpeed)} km/h`,
      profile,
    },
    center: {
      rect,
      discs,
      poles,
      finishX,
      split,
    },
    right: {
      rows: finished ? finalStandings(result, info) : liveStandings(frame, info),
      raceName: info.raceName,
      gradeBadge: gradeBadgeOf(info.grade),
      courseName: info.courseName,
      finished,
      photo,
    },
  };
}
