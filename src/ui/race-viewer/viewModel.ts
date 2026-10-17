/**
 * 레이스 띠 뷰어의 순수 계산 모듈. DOM 을 쓰지 않는다.
 * 그리기는 stripRenderer.ts 가 담당한다.
 */
import type {
  FractionalOdds,
  Going,
  HexColor,
  Margin,
  PathPoint,
  RaceEntry,
  RaceGrade,
  RacePath,
  RaceReplay,
  RaceResult,
  RunnerResult,
  ReplayFrame,
  Silks,
  Surface,
} from '../../engine/types';
import { formatMarginKo, marginFromLengths } from '../../engine/race/results';
import { formatOdds } from '../../engine/race/odds';
import { goingKo } from '../horse/horseDetailView';
import { SECTIONAL_STEP_M } from '../../engine/config/results';
import { PHOTO_MARGIN_LABELS } from '../../engine/config/commentary';
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
/** 결승 직후 사진 판정 컷 표시 시간(s). 이 뒤에 결과판이 나온다. */
export const PHOTO_HOLD_S = 2;
/** 결과판 행 수(상위 두수) */
export const BOARD_COUNT = 6;
/** m/s → km/h */
const KMH_PER_MPS = 3.6;
/** 음수 기호(U+2212). OR 변동 표기에 쓴다. */
const MINUS_SIGN = '−';
// ── 출발 대기 · 레인 분산 (UI 표시 상수, M7-R1) ────────────────────────
/** 재생 시간 τ 의 시작점(s, 음수). 게이트에 말이 들어가 대기하는 구간이다. 근거: 사용자 요청(2026-10-12) '2~3초 대기 후 출발'. */
export const GATE_HOLD_S = 2.5;
/** 출발 이 시간(s) 전부터 'ready'(문 앞 정렬 완료). 그 전은 'loading'(칸 안으로 들어가는 중). */
const GATE_READY_LEAD_S = 1.0;
/** 문이 열리는 표시 구간(s). 출발 직후 짧게 보인다. */
export const GATE_OPEN_FLASH_S = 0.35;
/** 로딩 중 원판이 칸 뒤쪽(−이 값 m)에서 칸 안으로 미끄러져 들어온다. */
const GATE_SLIDE_M = 3;
/** 칸 y 에서 레인 y 로 옮겨 가는 시간(s). 근거: 플레이 테스트(2026-10-17) '출발 즉시 달리기 시작'을 피하려고 첫 1.5s 를 보간. */
const START_BLEND_S = 1.5;
/** 칸 간 세로 간격 상한(px). 원판 지름 + 2px. 칸 수가 적어도 칸 열이 띠 전체로 흩어지지 않게 한다. */
const STALL_PITCH_PX = 2 * DISC_RADIUS + 2;
/** 필드 폭 W(m)의 하한. 근거: 플레이 테스트(2026-10-17) 캡처에서 폭이 좁으면 원판이 전부 아래 레일에 붙었다. */
const FIELD_MIN_SPREAD_M = 6;
/** 필드 폭을 정하는 창의 반폭(s). 이 구간 프레임들의 최대 레인으로 W 를 정해 확대·축소가 출렁이지 않게 한다. */
const FIELD_WINDOW_S = 1.5;
/** 레인 이동 평균 창 길이(s) */
const LANE_SMOOTH_S = 0.3;
/** 레인 이동 평균 표본 수(창 안 균등 분할) */
const LANE_SMOOTH_SAMPLES = 7;
/** 같은 자리 판정 배수(×r). |dx|, |dy| 모두 이 값 × r 미만이면 겹친 것으로 보고 바깥 원판을 위로 민다. */
const COLLISION_RATIO = 1.4;
/** 플레이어 이름표와 원판 윗변 사이 간격(px) */
const PLAYER_TAG_GAP_PX = 4;
/** 출발 전(τ<0) 우측 패널 제목. 근거: Opus 결정(2026-10-17) — 출발 전에는 실시간 순위 대신 인기 순. */
const PRE_RACE_HEADING = '인기 순';
/** 결승 기둥 라벨(펄롱 표지와 구분하는 문자) */
const FINISH_LABEL = 'F';

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
  /** 결과판용 OR 변동(선택). 없으면 결과판에서 OR 열을 생략한다. */
  ratingChanges?: Record<number /*runner index*/, { from: number | null; to: number }>;
}

export interface CameraWindow {
  from: number;
  to: number;
}

export interface StandingRow {
  runnerIndex: number;
  saddleCloth: number;
  silksPrimary: HexColor;
  silks: Silks;
  horseName: string;
  marginText: string;
  oddsText: string;
}

/** 결과판 한 줄. 착차·SP·OR 변동은 표기 문자열로 준다. */
export interface BoardRow {
  position: number;
  runnerIndex: number;
  saddleCloth: number;
  silks: Silks;
  isPlayer: boolean;
  horseName: string;
  /** 1착은 '1착', 동착은 '동착', 그 밖은 formatMarginKo */
  marginText: string;
  /** SP 분수 오즈. 없으면 '-' */
  oddsText: string;
  /** OR 변동 표기("+3", "−2", "첫 OR 98", "±0"). ratingChanges 가 없으면 null */
  ratingText: string | null;
}

/** 사진 판정 컷. t0 = 승자 결승 통과 시각(s). gapM = 1·2착 결승 시각 차 × 승자 속도(m). */
export interface PhotoCut {
  t0: number;
  /** runner index */
  winner: number;
  /** runner index */
  second: number;
  gapM: number;
}

export interface DiscPlacement {
  runnerIndex: number;
  x: number;
  y: number;
  fill: HexColor;
  silks: Silks;
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

/**
 * 출발 게이트. phase: loading(칸 안으로 들어가는 중) · ready(문 앞 정렬) · open(문 열림 표시) ·
 * left(출발 뒤 게이트가 뒤에 남아 카메라와 함께 왼쪽으로 흘러간다. 앞문이 띠 왼쪽 밖으로 나가면 게이트는 null).
 */
export interface GateView {
  phase: 'loading' | 'ready' | 'open' | 'left';
  /** 출발까지 남은 초. open·left 이면 0. */
  remaining: number;
  /** 칸 열의 x(카메라 창 기준, 출발선 progress 0). 카메라를 따라 움직인다. */
  x: number;
  /** index = draw − 1 인 칸 y. draw 1 = 내측 = 아래. */
  stalls: number[];
}

/** 내 말의 현재 순위. behind 는 선두와의 차(마신 표기), 선두(1위)면 null. */
export interface MyStanding {
  position: number;
  behind: string | null;
}

/** 출발 전 내 말의 인기 순위(1 = 가장 낮은 오즈)와 오즈 표기. */
export interface MyFavourite {
  rank: number;
  oddsText: string;
}

/** 이름표 자리. above: (x 가운데, y 는 상자 아래쪽). right: (x 는 상자 왼쪽, y 는 상자 세로 가운데). */
export interface PlayerTag {
  x: number;
  y: number;
  name: string;
  placement: 'above' | 'right';
}

export interface StripModel {
  width: number;
  height: number;
  left: {
    layout: PathPoint[];
    race: PathPoint[];
    leader: PathPoint;
    /** 주로 한국어: 잔디 · 올웨더 · 더트 */
    surfaceLabel: string;
    /** 거리 한국어 표기: '1,200m (6f)' */
    distanceText: string;
    /** 마장 한국어: 좋음 · 표준 · 진흙 …(goingKo) */
    goingLabel: string;
    remainingLabel: string;
    speedLabel: string;
    /** 고저 단면. 좌표는 strip 전체 기준(좌측 패널 하단 띠 안). marker = 선두 위치 */
    profile: { points: { x: number; y: number }[]; marker: { x: number; y: number } };
  };
  center: {
    rect: Rect;
    discs: DiscPlacement[];
    /** 카메라 창(progress 단위, m). 잔디 줄무늬 등 주로 그림이 이 창에 맞춰 흐른다. */
    camera: CameraWindow;
    /** 선두가 지난 마지막 펄롱 구간 시간("12.6s"). 첫 구간을 다 지나기 전이면 null */
    split: string | null;
    /** 사진 판정 컷. 사진 판정 레이스이고 t0 ≤ t < t0 + PHOTO_HOLD_S 일 때만 값이 있다. */
    photoCut: PhotoCut | null;
  };
  right: {
    /** 제목: 출발 전이면 '인기 순', 그 밖은 null */
    heading: string | null;
    /** 실시간 순위(결승 전) 또는 확정 순위 상위 3두. 출발 전에는 인기 순 상위 3두(착차 없음, 오즈만). */
    rows: StandingRow[];
    /** 결과판(상위 BOARD_COUNT두). 사진 컷이 끝나고 3착까지 통과한 뒤에만 값이 있다. */
    board: BoardRow[] | null;
    raceName: string;
    gradeBadge: string | null;
    courseName: string;
    finished: boolean;
  };
  /** 출발 게이트. 출발 전(loading·ready)·출발 직후(open)·뒤에 남은 게이트(left). 카메라 밖으로 나가면 null. */
  gate: GateView | null;
  /** 카메라 창 안의 펄롱 표지('5f' 식) 와 결승선 'F'. x 오름차순. */
  poles: { x: number; label: string }[];
  /** 플레이어 말 이름표. 출발 대기 중에는 게이트 오른쪽(앞문 바깥)에 같은 높이로 둔다. */
  playerTags: PlayerTag[];
  /** 첫 플레이어 말의 현재 순위(결승 후는 확정 순위). 출발 전·플레이어 말 없음이면 null. */
  myStanding: MyStanding | null;
  /** 출발 전 내 말의 인기 순위와 오즈. 출발 뒤·플레이어 말 없음이면 null. */
  myFavourite: MyFavourite | null;
  surface: Surface;
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

/** 진행도 차(m)를 착차 문구로. 마신 환산은 LENGTH_M. */
function marginTextOf(gapM: number): string {
  return formatMarginKo(marginFromLengths(gapM / LENGTH_M));
}

/** 실시간 순위 상위 count 두. 착차는 직전 말과의 progress 차를 marginTextOf 로 환산한다. */
export function liveStandings(frame: ReplayFrame, info: ViewerInfo, count = 3): StandingRow[] {
  const order = orderByProgress(frame.progress, info).slice(0, count);
  const rows: StandingRow[] = [];
  let prevIndex: number | undefined;
  for (const runnerIndex of order) {
    const entry = requireEntry(info, runnerIndex);
    let marginText = '선두';
    if (prevIndex !== undefined) {
      marginText = marginTextOf((frame.progress[prevIndex] ?? 0) - (frame.progress[runnerIndex] ?? 0));
    }
    rows.push({
      runnerIndex,
      saddleCloth: entry.saddleCloth,
      silksPrimary: entry.silks.primary,
      silks: entry.silks,
      horseName: horseNameOf(info, runnerIndex),
      marginText,
      oddsText: entry.odds === null ? '-' : formatOdds(entry.odds),
    });
    prevIndex = runnerIndex;
  }
  return rows;
}

/** 확정 착차 문구. 1착은 '1착', 동착(margin null)은 '동착', 그 밖은 formatMarginKo. */
function finalMarginText(rr: RunnerResult): string {
  if (rr.position === 1) return '1착';
  if (rr.margin === null) return '동착';
  return formatMarginKo(rr.margin);
}

/** 확정 결과 상위 count 두. result.runners 순서를 따른다. */
export function finalStandings(result: RaceResult, info: ViewerInfo, count = 3): StandingRow[] {
  return result.runners.slice(0, count).map((rr) => {
    const entry = requireEntry(info, rr.runnerIndex);
    return {
      runnerIndex: rr.runnerIndex,
      saddleCloth: rr.saddleCloth,
      silksPrimary: entry.silks.primary,
      silks: entry.silks,
      horseName: horseNameOf(info, rr.runnerIndex),
      marginText: finalMarginText(rr),
      oddsText: rr.odds === null ? '-' : formatOdds(rr.odds),
    };
  });
}

// ── 출발 전 인기 순 (M7-R2b) ─────────────────────────────────────────
/** 오즈 값(분수 num/den). 오즈가 없으면 무한대(맨 뒤). */
function oddsValueOf(odds: FractionalOdds | null): number {
  return odds === null ? Infinity : odds.num / odds.den;
}

/** 인기 순 runner index 배열: 오즈가 낮은 순, 같으면 마번 오름차순. */
export function favouriteOrder(info: ViewerInfo): number[] {
  const idx = info.entries.map((_, i) => i);
  idx.sort((a, b) => {
    const va = oddsValueOf(requireEntry(info, a).odds);
    const vb = oddsValueOf(requireEntry(info, b).odds);
    if (va !== vb) return va < vb ? -1 : 1;
    return requireEntry(info, a).saddleCloth - requireEntry(info, b).saddleCloth;
  });
  return idx;
}

/** 출발 전 인기 순 상위 count 두. 착차 자리는 비우고(빈 문자열) 오즈만 보인다. */
export function favouriteStandings(info: ViewerInfo, count = 3): StandingRow[] {
  return favouriteOrder(info)
    .slice(0, count)
    .map((runnerIndex) => {
      const entry = requireEntry(info, runnerIndex);
      return {
        runnerIndex,
        saddleCloth: entry.saddleCloth,
        silksPrimary: entry.silks.primary,
        silks: entry.silks,
        horseName: horseNameOf(info, runnerIndex),
        marginText: '',
        oddsText: entry.odds === null ? '-' : formatOdds(entry.odds),
      };
    });
}

/** 출발 전 내 말의 인기 순위와 오즈. 플레이어 말이 없으면 null. */
function myFavouriteOf(info: ViewerInfo): MyFavourite | null {
  const order = favouriteOrder(info);
  const pos = order.findIndex((i) => requireEntry(info, i).isPlayer);
  if (pos < 0) return null;
  const entry = requireEntry(info, order[pos] ?? 0);
  return { rank: pos + 1, oddsText: entry.odds === null ? '-' : formatOdds(entry.odds) };
}

/** OR 변동 표기. 첫 OR 은 "첫 OR 98", 변동은 "+3", "−2", 0 은 "±0". */
export function formatRatingChange(change: { from: number | null; to: number }): string {
  if (change.from === null) return `첫 OR ${change.to}`;
  const delta = change.to - change.from;
  if (delta === 0) return '±0';
  return delta > 0 ? `+${delta}` : `${MINUS_SIGN}${-delta}`;
}

/** 결과판 상위 count 두. result.runners 순서를 따른다. 착차·SP 는 확정 기록, OR 변동은 info.ratingChanges. */
export function resultBoard(result: RaceResult, info: ViewerInfo, count = BOARD_COUNT): BoardRow[] {
  return result.runners.slice(0, count).map((rr) => {
    const entry = requireEntry(info, rr.runnerIndex);
    const change = info.ratingChanges?.[rr.runnerIndex];
    return {
      position: rr.position,
      runnerIndex: rr.runnerIndex,
      saddleCloth: rr.saddleCloth,
      silks: entry.silks,
      isPlayer: entry.isPlayer,
      horseName: horseNameOf(info, rr.runnerIndex),
      marginText: finalMarginText(rr),
      oddsText: rr.odds === null ? '-' : formatOdds(rr.odds),
      ratingText: change === undefined ? null : formatRatingChange(change),
    };
  });
}

/** 1·2착 착차가 사진 판정 라벨이거나 동착(margin null)이면 사진 판정 레이스. 아니면 null. */
export function isPhotoMargin(margin: Margin | null): boolean {
  return margin === null || PHOTO_MARGIN_LABELS.includes(margin.label);
}

/**
 * 레이스 단위 사진 판정 정보. 시간과 무관하다(화면에 보일지는 buildStripModel 이 정한다).
 * t0 = 승자 결승 통과 시각. gapM = (2착 결승 시각 − 승자 결승 시각) × 승자 결승 시점 속도.
 */
export function photoCutFor(replay: RaceReplay, result: RaceResult): PhotoCut | null {
  const winner = result.runners[0];
  const second = result.runners[1];
  if (winner === undefined || second === undefined) return null;
  if (!isPhotoMargin(second.margin)) return null;
  const speed = frameAt(replay, winner.finishTime).speed[winner.runnerIndex] ?? 0;
  return {
    t0: winner.finishTime,
    winner: winner.runnerIndex,
    second: second.runnerIndex,
    gapM: (second.finishTime - winner.finishTime) * speed,
  };
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

/** 주로 종류 한국어: 잔디 · 올웨더 · 더트 */
const SURFACE_LABEL_KO: Record<Surface, string> = { turf: '잔디', aw: '올웨더', dirt: '더트' };

export function surfaceLabelKo(surface: Surface): string {
  return SURFACE_LABEL_KO[surface];
}

/** '1,600m (8f)', '1,207m (6f)', '1,100m (5½f)' */
export function formatDistanceText(distance: number): string {
  return `${thousands(distance)}m (${furlongCountText(distance / FURLONG_M)}f)`;
}

/** '잔디 1,600m (8f)', '올웨더 1,207m (6f)', '잔디 1,100m (5½f)' */
export function formatDistanceLabel(surface: Surface, distance: number): string {
  return `${surfaceLabelKo(surface)} ${formatDistanceText(distance)}`;
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
/** 출발 대기 레이아웃 입력(placeDiscs). y 는 칸 y 에서 레인 y 로 blend 만큼 보간하고, x 는 progressOffset 만큼 민다. */
export interface StartLayout {
  /** index = draw − 1 인 칸 y. draw 1 = 내측 = 아래. */
  stallY: readonly number[];
  /** 0 = 칸 y, 1 = 레인 y */
  blend: number;
  /** progress 에 더하는 오프셋(m). 로딩 중 칸 뒤쪽에서 들어오는 연출에 쓴다. */
  progressOffset: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * 원판 배치. x 는 카메라 창 기준, y 는 레인 기준(0 = 아래쪽 내측 레일).
 * spreadM 은 필드 폭 W(m): 레인 m 을 띠 사용 높이의 lane / W 로 매핑한다.
 * 같은 자리(|dx|, |dy| 모두 COLLISION_RATIO·r 미만)면 바깥 레인 원판을 위로 민다.
 * 밀기 순서는 레인 안쪽 → 바깥(같은 레인은 runnerIndex 순)이라 결과가 결정적이다.
 * start 가 있으면 y 를 칸 y 에서 레인 y 로 start.blend 만큼 보간한다.
 * 반환은 그리기 순서: 레인 바깥 → 안쪽(안쪽이 위), 같은 레인은 runnerIndex 오름차순.
 * alpha: 자기보다 앞쪽(progress 가 큰) 원판과 2·DISC_RADIUS 이내면 OVERLAP_ALPHA.
 */
export function placeDiscs(
  frame: ReplayFrame,
  win: CameraWindow,
  info: ViewerInfo,
  rect: Rect,
  spreadM: number,
  start?: StartLayout,
): DiscPlacement[] {
  if (!(spreadM > 0)) throw new RangeError(`spreadM 은 0보다 커야 한다 (${spreadM})`);
  const span = win.to - win.from;
  const usableH = rect.h - 2 * DISC_RADIUS;
  const yMin = rect.y + DISC_RADIUS;
  const yMax = rect.y + rect.h - DISC_RADIUS;
  const offset = start?.progressOffset ?? 0;
  const blend = start?.blend ?? 1;

  interface Node {
    runnerIndex: number;
    lane: number;
    progress: number;
    x: number;
    y: number;
    /** 밀기·칸 보간 전 레인 y. 겹침 흐림(alpha) 판정에 쓴다. */
    laneY: number;
  }
  const nodes: Node[] = frame.progress.map((p, runnerIndex) => {
    const lane = frame.lane[runnerIndex] ?? 0;
    const progress = p + offset;
    const x = rect.x + ((progress - win.from) / span) * rect.w;
    const y = clamp(rect.y + rect.h - DISC_RADIUS - (lane / spreadM) * usableH, yMin, yMax);
    return { runnerIndex, lane, progress, x, y, laneY: y };
  });

  // 겹침 줄이기: 안쪽(레인 작은 순, 같은 레인은 runnerIndex 순)부터 자리를 정하고 뒤의 바깥 원판을 위로 민다.
  // 겹침 판정은 COLLISION_RATIO·r 로 하고, 밀어낼 때는 원판 지름(2·r)만큼 떨어뜨려 완전히 겹치지 않게 한다.
  const detectDist = COLLISION_RATIO * DISC_RADIUS;
  const pushDist = 2 * DISC_RADIUS;
  const byInside = [...nodes].sort((a, b) => a.lane - b.lane || a.runnerIndex - b.runnerIndex);
  const settled: Node[] = [];
  for (const node of byInside) {
    // 위로 민 자리가 다른 원판과 또 겹칠 수 있으므로 겹치지 않을 때까지 반복한다(원판 수를 넘지 않는다).
    for (let guard = 0; guard <= nodes.length; guard++) {
      const hit = settled.find(
        (o) => Math.abs(o.x - node.x) < detectDist && Math.abs(o.y - node.y) < detectDist,
      );
      if (hit === undefined) break;
      node.y = Math.max(yMin, hit.y - pushDist);
    }
    settled.push(node);
  }

  // 출발 대기: 칸 y 에서 레인 y 로 보간(blend 0 = 칸, 1 = 레인)
  if (start !== undefined && blend < 1) {
    for (const node of nodes) {
      const entry = requireEntry(info, node.runnerIndex);
      const stall = start.stallY[entry.draw - 1] ?? node.y;
      node.y = blend <= 0 ? stall : stall + (node.y - stall) * blend;
    }
  }

  // alpha 는 밀기 전 레인 위치로 판정한다(앞쪽 원판과 겹쳐 있던 뒤쪽 원판을 흐리게 하는 기존 규칙)
  const minDist = 2 * DISC_RADIUS;
  const drawOrder = [...nodes].sort((a, b) => b.lane - a.lane || a.runnerIndex - b.runnerIndex);
  return drawOrder.map((d) => {
    const overlapped = nodes.some(
      (o) => o !== d && o.progress > d.progress && Math.hypot(o.x - d.x, o.laneY - d.laneY) < minDist,
    );
    const entry = requireEntry(info, d.runnerIndex);
    const fill = entry.silks.primary;
    return {
      runnerIndex: d.runnerIndex,
      x: d.x,
      y: d.y,
      fill,
      silks: entry.silks,
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

// ── 출발 대기 · 레인 분산 (M7-R1) ─────────────────────────────────────
/** 0~1 로 자른 뒤 smoothstep(3s²−2s³) */
function smoothstep(v: number): number {
  const s = clamp(v, 0, 1);
  return s * s * (3 - 2 * s);
}

/**
 * τ 시점의 게이트 단계. 출발 뒤에도 게이트는 뒤에 남아 카메라와 함께 흐른다(left).
 * 앞문(게이트 x + 원판 반지름)이 띠 왼쪽 밖으로 나가면 null.
 */
function gatePhaseAt(t: number, gateX: number, rect: Rect): GateView['phase'] | null {
  if (t < -GATE_READY_LEAD_S) return 'loading';
  if (t < 0) return 'ready';
  if (t < GATE_OPEN_FLASH_S) return 'open';
  return gateX >= rect.x - DISC_RADIUS ? 'left' : null;
}

/** 게이트 뷰. phase 가 null 이면 게이트 없음. */
function gateViewAt(t: number, gateX: number, rect: Rect, stalls: number[]): GateView | null {
  const phase = gatePhaseAt(t, gateX, rect);
  if (phase === null) return null;
  const waiting = phase === 'loading' || phase === 'ready';
  return { phase, remaining: waiting ? Math.max(0, -t) : 0, x: gateX, stalls };
}

/** 칸 y → 레인 y 보간 계수(출발 전 0, START_BLEND_S 동안 0 → 1). */
function startBlendAt(t: number): number {
  return t <= 0 ? 0 : smoothstep(t / START_BLEND_S);
}

/** 로딩 중 progress 오프셋: 칸 뒤쪽 −GATE_SLIDE_M 에서 칸 안(0)으로 들어온다. ready 부터 0. */
function gateSlideOffsetAt(t: number): number {
  if (t >= -GATE_READY_LEAD_S) return 0;
  const k = smoothstep((t + GATE_HOLD_S) / (GATE_HOLD_S - GATE_READY_LEAD_S));
  return -GATE_SLIDE_M * (1 - k);
}

/**
 * 칸 y 목록(index = draw − 1, draw 1 = 내측 = 아래). 간격은 STALL_PITCH_PX 이하이고 띠 가운데에 모은다.
 */
export function stallYs(count: number, rect: Rect): number[] {
  const usableH = rect.h - 2 * DISC_RADIUS;
  const pitch = count > 1 ? Math.min(STALL_PITCH_PX, usableH / (count - 1)) : 0;
  const bottom = rect.y + rect.h / 2 + ((count - 1) * pitch) / 2;
  return Array.from({ length: count }, (_, k) => bottom - k * pitch);
}

/**
 * 필드 폭 W(m). 창 중심(t 를 [0, duration] 으로 자른 값)의 ±FIELD_WINDOW_S 프레임들의 최대 레인 + 1m,
 * 하한 FIELD_MIN_SPREAD_M. 창 안 최대값을 쓰므로 프레임마다 출렁이지 않는다.
 */
export function fieldSpreadM(replay: RaceReplay, t: number): number {
  const duration = replayDuration(replay);
  const centre = t > 0 ? Math.min(t, duration) : 0;
  let maxLane = 0;
  for (const f of replay.frames) {
    if (Math.abs(f.t - centre) > FIELD_WINDOW_S) continue;
    for (const l of f.lane) {
      if (l > maxLane) maxLane = l;
    }
  }
  return Math.max(FIELD_MIN_SPREAD_M, maxLane + 1);
}

/** τ 시점 레인의 이동 평균(LANE_SMOOTH_S 창, 균등 표본). 프레임 사이는 frameAt 이 선형 보간한다. */
export function smoothedLanes(replay: RaceReplay, t: number): number[] {
  const half = (LANE_SMOOTH_SAMPLES - 1) / 2;
  const samples = Array.from({ length: LANE_SMOOTH_SAMPLES }, (_, k) =>
    frameAt(replay, t + (LANE_SMOOTH_S * (k - half)) / (LANE_SMOOTH_SAMPLES - 1)).lane,
  );
  const n = samples[0]?.length ?? 0;
  return Array.from({ length: n }, (_, i) => {
    let sum = 0;
    for (const lane of samples) sum += lane[i] ?? 0;
    return sum / samples.length;
  });
}

/** 첫 플레이어 말의 현재 순위와 선두와의 차. 결승 후는 확정 순위. 플레이어 말이 없으면 null. */
function myStandingOf(
  frame: ReplayFrame,
  info: ViewerInfo,
  result: RaceResult,
  finished: boolean,
): MyStanding | null {
  const me = info.entries.findIndex((e) => e.isPlayer);
  if (me < 0) return null;
  if (finished) {
    const rr = result.runners.find((r) => r.runnerIndex === me);
    if (rr === undefined) return null;
    return { position: rr.position, behind: rr.position === 1 ? null : finalMarginText(rr) };
  }
  const order = orderByProgress(frame.progress, info);
  const pos = order.indexOf(me);
  const leader = order[0];
  if (pos < 0 || leader === undefined) return null;
  if (pos === 0) return { position: 1, behind: null };
  const gap = (frame.progress[leader] ?? 0) - (frame.progress[me] ?? 0);
  return { position: pos + 1, behind: marginTextOf(gap) };
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
  const winSpan = win.to - win.from;
  const xOf = (progress: number): number => rect.x + ((progress - win.from) / winSpan) * rect.w;

  // 출발 대기 + 레인 분산: τ<0 은 칸에서 대기, τ 가 0 을 지나면 START_BLEND_S 동안 칸 y 에서 레인 y 로 옮긴다.
  const stalls = stallYs(info.entries.length, rect);
  const discs = placeDiscs(
    { t: frame.t, progress: frame.progress, lane: smoothedLanes(replay, t), speed: frame.speed },
    win,
    info,
    rect,
    fieldSpreadM(replay, t),
    { stallY: stalls, blend: startBlendAt(t), progressOffset: gateSlideOffsetAt(t) },
  );
  const gate = gateViewAt(t, xOf(0), rect, stalls);

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

  // 우측·사진 판정 시각
  const runners = result.runners;
  const last = runners[runners.length - 1];
  if (last === undefined) throw new RangeError('buildStripModel: 결과에 주자가 없다');
  const third = runners[2] ?? last;
  const finished = frame.t >= third.finishTime;
  const preRace = t < 0;
  const photoRace = photoCutFor(replay, result);
  const photoOn =
    photoRace !== null && frame.t >= photoRace.t0 && frame.t < photoRace.t0 + PHOTO_HOLD_S;
  // 결과판: 3착 통과 후이고, 사진 판정 컷이 있었다면 컷이 끝난 뒤
  const boardAt =
    photoRace === null ? third.finishTime : Math.max(third.finishTime, photoRace.t0 + PHOTO_HOLD_S);
  const boardOn = frame.t >= boardAt;

  const finishLabel = finishX === null ? [] : [{ x: finishX, label: FINISH_LABEL }];
  // 출발 대기 중 이름표는 게이트 오른쪽(앞문 바깥)에 같은 높이로 둔다(뒤 칸 원판을 가리지 않게).
  const gateTagX =
    gate !== null && (gate.phase === 'loading' || gate.phase === 'ready')
      ? gate.x + DISC_RADIUS + PLAYER_TAG_GAP_PX
      : null;
  const playerTags: PlayerTag[] = discs
    .filter((d) => d.isPlayer)
    .map((d) => {
      const name = horseNameOf(info, d.runnerIndex);
      if (gateTagX !== null) return { x: gateTagX, y: d.y, name, placement: 'right' };
      return { x: d.x, y: d.y - DISC_RADIUS - PLAYER_TAG_GAP_PX, name, placement: 'above' };
    });

  return {
    width,
    height,
    left: {
      layout: path.layoutPolyline,
      race: path.racePolyline,
      leader: path.sample(leaderProgress).point,
      surfaceLabel: surfaceLabelKo(info.surface),
      distanceText: formatDistanceText(distance),
      goingLabel: goingKo(info.going),
      remainingLabel: formatRemaining(distance - leaderProgress),
      speedLabel: `${speedKmh(leaderSpeed)} km/h`,
      profile,
    },
    center: {
      rect,
      discs,
      camera: { from: win.from, to: win.to },
      split,
      photoCut: photoOn && photoRace !== null ? photoRace : null,
    },
    right: {
      heading: preRace ? PRE_RACE_HEADING : null,
      rows: preRace
        ? favouriteStandings(info)
        : finished
          ? finalStandings(result, info)
          : liveStandings(frame, info),
      board: boardOn ? resultBoard(result, info) : null,
      raceName: info.raceName,
      gradeBadge: gradeBadgeOf(info.grade),
      courseName: info.courseName,
      finished,
    },
    gate,
    poles: [...poles, ...finishLabel].sort((a, b) => a.x - b.x),
    playerTags,
    myStanding: preRace ? null : myStandingOf(frame, info, result, finished),
    myFavourite: preRace ? myFavouriteOf(info) : null,
    surface: info.surface,
  };
}
