/**
 * 레이스 띠 뷰어 그리기. CanvasRenderingContext2D 에 그리기만 하며 상태를 계산하지 않는다.
 * 외부 이미지·폰트는 쓰지 않는다(system-ui).
 */
import type { PathPoint, Silks, Surface } from '../../engine/types';
import { DISC_RADIUS, discBorderFor, PROFILE_H, profileRect, textColorFor } from './viewModel';
import type { BoardRow, DiscPlacement, PlayerTag, Rect, StandingRow, StripModel } from './viewModel';
import { drawSilksDisc } from './silks';

// ── 그리기 상수 (표시용) ──────────────────────────────────────────────
const OUTER_BG = '#11181f';
const PANEL_PAD = 10;
const TEXT_LINE_H = 16;
const TEXT_LINES = 4;
const MINIMAP_DOT_R = 4;
const LAYOUT_STROKE = '#6b7785';
const RACE_STROKE = '#ffffff';
const LEADER_FILL = '#f5c518';
const PROFILE_STROKE = '#8fb3d9';
const PROFILE_BASE_STROKE = '#55626f';
const PROFILE_LINE_W = 1.5;
const PROFILE_MARKER_R = 3;
const FONT_SPLIT = '11px system-ui';
/** 구간 기록 글씨의 오른쪽 안쪽 여백(px). 진행 방향 화살표 왼쪽에 둔다. */
const SPLIT_INSET_X = 24;
const TEXT_MAIN = '#e6edf3';
const TEXT_MUTED = '#9aa7b4';
const FONT_SMALL = '12px system-ui';
const FONT_BOLD = 'bold 12px system-ui';
const FONT_DISC_LABEL = 'bold 11px system-ui';
const FONT_ROW_NO = 'bold 10px system-ui';
const FONT_ROW_MARGIN = 'bold 13px system-ui';
const FONT_ROW_NAME = '11px system-ui';
const FONT_RACE_NAME = 'bold 13px system-ui';
const FONT_COURSE = '11px system-ui';
const FONT_BOARD_HEAD = '10px system-ui';
const FONT_BOARD_CELL = '11px system-ui';
const FONT_BOARD_POS = 'bold 11px system-ui';
const FONT_PHOTO = 'bold 14px system-ui';
const FINISH_STROKE = '#e5484d';
const ROW_TOP = 12;
const ROW_H = 40;
const ROW_DISC_R = 8;
const ROW_TEXT_X = 24;
/** 결과판: 머리글 줄 기준선, 첫 행 top, 행 높이 */
const BOARD_HEAD_Y = 22;
const BOARD_TOP = 26;
const BOARD_ROW_H = 24;
/** 결과판 열(x0 기준 오프셋, px). 착순 | 마번 원판 | 마명 | 착차 | SP | OR(우측 끝) */
const BOARD_POS_X = 6;
const BOARD_DISC_X = 26;
const BOARD_NAME_X = 40;
const BOARD_NAME_W = 80;
const BOARD_MARGIN_RIGHT_X = 176;
const BOARD_MARGIN_W = 56;
const BOARD_ODDS_RIGHT_X = 206;
const BOARD_ODDS_W = 40;
const BOARD_RATING_W = 60;
const BADGE_W = 44;
const BADGE_H = 16;
const BADGE_FILL = '#3b5b7a';
/** 번호 뒤 주색 작은 원의 반지름 비율(원판 반지름 대비) */
const NUMBER_BADGE_RATIO = 0.6;
/** 사진 판정 패널 크기·모양(px). 띠 높이가 작으면 중앙 영역에 맞춰 줄인다. */
const PHOTO_PANEL_W = 300;
const PHOTO_PANEL_H = 150;
const PHOTO_PANEL_FILL = 'rgba(0, 0, 0, 0.8)';
const PHOTO_PANEL_RADIUS = 6;
const PHOTO_TITLE_H = 26;
const PHOTO_DISC_R = 16;
/** 두 말의 lane 중심(본문 높이 대비). 승자는 위, 2착은 아래 레인 */
const PHOTO_LANE_WINNER = 0.3;
const PHOTO_LANE_SECOND = 0.7;
/** 결승 통과 순간의 착차(m)를 화면 픽셀로 확대하는 배율(px/m) */
const PHOTO_PX_PER_M = 100;
const LABEL_TOP_Y = 3;
const TAU = Math.PI * 2;

// ── 주로 · 레일 · 펄롱 표지 (M7-R2) ─────────────────────────────────────
/**
 * 주로 바탕색: 잔디 짙은 녹색, 올웨더 회갈색, 더트 갈색.
 * 띠 위 글자색(TEXT_MAIN)과 대비 4.5:1 이상을 유지한다(tests/ui/raceViewer*.test.ts 에서 확인).
 */
export const TRACK_BG: Record<Surface, string> = {
  turf: '#2a5a34',
  aw: '#5a544c',
  dirt: '#6b4a2e',
};
/**
 * 잔디 줄무늬: 카메라 창의 progress 기준으로 STRIPE_M 마다 번갈아 칠한다(카메라와 함께 흐른다).
 * 잔디는 바탕보다 조금 밝은 같은 계열 2색 띠, 올웨더·더트는 흰색을 아주 옅게 겹친다.
 */
const STRIPE_M = 25;
const STRIPE_FILL: Record<Surface, string> = {
  turf: '#2f6639',
  aw: 'rgba(255, 255, 255, 0.05)',
  dirt: 'rgba(255, 255, 255, 0.05)',
};
const RAIL_INNER_STROKE = '#ffffff';
const RAIL_OUTER_STROKE = 'rgba(255, 255, 255, 0.3)';
const RAIL_W = 1.5;
/** 레일 선을 띠 가장자리에서 안쪽으로 띄우는 거리(px) */
const RAIL_INSET_PX = 3;
const POLE_STROKE = 'rgba(230, 237, 243, 0.55)';
const POLE_DASH: readonly number[] = [4, 4];
const FONT_POLE = 'bold 12px system-ui';
const FINISH_LABEL = 'F';
/** 결승 기둥 체크 한 칸(px)과 기둥 폭(px). 맨 위 라벨 줄 아래에서 시작한다. */
const FINISH_CHECK_PX = 6;
const FINISH_POST_W = 8;
const FINISH_CHECK_LIGHT = '#ffffff';
const FINISH_CHECK_DARK = '#111111';
/**
 * 출발 게이트: 로딩 중 말이 들어가 있는 뒤쪽 거리(px, 출발선 왼쪽). 출발 카메라 창(약 40m)에서 말 3m 슬라이드 폭에 맞춘 값이다.
 * 칸 틀은 뒤벽(뒤쪽 원판 가장자리)부터 앞문(출발선 쪽 원판 가장자리)까지다.
 */
const GATE_SLIDE_PX = 50;
/** 칸 틀의 위·아래 여백(원판 반지름 밖, px) */
const GATE_PAD_Y = 3;
const GATE_FILL = 'rgba(0, 0, 0, 0.35)';
const GATE_FRAME = '#a7b1bd';
const GATE_DIVIDER = 'rgba(167, 177, 189, 0.5)';
const GATE_OPEN_LINE = '#ffffff';
const GATE_OPEN_LINE_W = 2;
const FONT_GATE_NO = '9px system-ui';
const FONT_GATE_LABEL = 'bold 11px system-ui';
/** 칸 번호와 틀 사이 간격, '출발 준비' 글자의 띠 가장자리 여백(px) */
const GATE_NO_GAP_PX = 4;
const GATE_LABEL_INSET_PX = 8;
/** 원판 그림자(겹침 구분): 아래로 1px 어두운 원 */
const DISC_SHADOW = 'rgba(0, 0, 0, 0.45)';
const DISC_SHADOW_PX = 1;
/** 내 말 강조 링(두께·중심 반지름 보정). 토큰과 비슷한 밝은 금색(PLAYER_RING). */
const PLAYER_RING_W = 4;
const PLAYER_RING_OFFSET = 0.5;
const PLAYER_RING = '#f5c518';
/** 내 말 이름표(작은 둥근 상자) */
const TAG_H = 16;
const TAG_PAD_X = 5;
const TAG_FILL = 'rgba(0, 0, 0, 0.78)';
const FONT_TAG = 'bold 11px system-ui';
/** 이름 폭 근사치(px). measureText 없이 그리기 전에 상자 폭을 정하려고 쓴다. */
const TAG_NARROW_CHAR_PX = 7;
const TAG_WIDE_CHAR_PX = 12;
const TAG_MAX_W = 140;
/** 우측 패널: 상위 3두 아래 구분선, 내 말 줄, 진행 막대 */
const STANDING_GAP_Y = 2;
const STANDING_TEXT_DY = 20;
const STANDING_BAR_DY = 30;
/** 우측 패널 제목(출발 전 '인기 순') 줄 높이와 글자 */
const HEADING_H = 16;
const HEADING_BASELINE_Y = 11;
const FONT_HEADING = 'bold 11px system-ui';
const SEPARATOR = 'rgba(159, 179, 201, 0.35)';
const FONT_STANDING_HI = 'bold 12px system-ui';
const PROGRESS_H = 6;
const PROGRESS_TRACK = 'rgba(255, 255, 255, 0.14)';
const PROGRESS_FILL = '#8fb3d9';

/** 그리기 한 번을 감싸는 공통 헬퍼: 모든 상태 변경은 save/restore 안에서 한다. */
export function drawStrip(ctx: CanvasRenderingContext2D, model: StripModel): void {
  ctx.save();
  drawBackground(ctx, model);
  drawLeftPanel(ctx, model);
  drawCenter(ctx, model);
  drawDiscs(ctx, model);
  drawPlayerTags(ctx, model);
  drawPhotoCut(ctx, model);
  drawRightPanel(ctx, model);
  ctx.restore();
}

function drawBackground(ctx: CanvasRenderingContext2D, model: StripModel): void {
  ctx.save();
  ctx.fillStyle = OUTER_BG;
  ctx.fillRect(0, 0, model.width, model.height);
  ctx.restore();
}

// ── 좌측 패널 ─────────────────────────────────────────────────────────
interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function boundsOf(points: readonly PathPoint[]): Bounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX)) return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
  return { minX, maxX, minY, maxY };
}

function strokePolyline(ctx: CanvasRenderingContext2D, pts: readonly PathPoint[]): void {
  const first = pts[0];
  if (first === undefined) return;
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    if (p !== undefined) ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
}

function drawLeftPanel(ctx: CanvasRenderingContext2D, model: StripModel): void {
  const { left } = model;
  const panelW = model.center.rect.x;
  // 미니맵은 텍스트 줄과 고저 단면 띠 위쪽에 남는 높이만큼만 쓴다
  const side = Math.max(
    10,
    Math.min(panelW - 2 * PANEL_PAD, model.height - TEXT_LINES * TEXT_LINE_H - PROFILE_H - 4 * PANEL_PAD),
  );

  // 미니맵: 레이아웃 bbox 를 정사각형에 균등 축척으로 맞추고 y 를 뒤집는다.
  const b = boundsOf(left.layout);
  const bw = Math.max(b.maxX - b.minX, 1);
  const bh = Math.max(b.maxY - b.minY, 1);
  const scale = Math.min(side / bw, side / bh);
  const ox = PANEL_PAD + (side - bw * scale) / 2;
  const oy = PANEL_PAD + (side - bh * scale) / 2;
  const map = (p: PathPoint): PathPoint => ({
    x: ox + (p.x - b.minX) * scale,
    y: oy + (b.maxY - p.y) * scale,
  });

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = LAYOUT_STROKE;
  ctx.lineWidth = 1;
  strokePolyline(ctx, left.layout.map(map));
  ctx.strokeStyle = RACE_STROKE;
  ctx.lineWidth = 3;
  strokePolyline(ctx, left.race.map(map));
  const lp = map(left.leader);
  ctx.fillStyle = LEADER_FILL;
  ctx.beginPath();
  ctx.arc(lp.x, lp.y, MINIMAP_DOT_R, 0, TAU);
  ctx.fill();
  ctx.restore();

  // 코스 정보 4줄: 주로·거리, 마장(한국어), 남은 거리, 선두 속도
  const lines = [
    `${left.surfaceLabel} ${left.distanceText}`,
    `마장 ${left.goingLabel}`,
    `남은 거리 ${left.remainingLabel}`,
    `선두 ${left.speedLabel}`,
  ];
  ctx.save();
  ctx.font = FONT_SMALL;
  ctx.fillStyle = TEXT_MAIN;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const textTop = PANEL_PAD + side + PANEL_PAD;
  lines.forEach((line, i) => {
    ctx.fillText(line, PANEL_PAD, textTop + (i + 1) * TEXT_LINE_H - 3);
  });
  ctx.restore();

  // 고저 단면: 텍스트 아래 띠. 점선은 출발점 높이(h = 0), 점은 선두 위치.
  drawProfile(ctx, left.profile);
}

function drawProfile(ctx: CanvasRenderingContext2D, profile: StripModel['left']['profile']): void {
  const { points, marker } = profile;
  const first = points[0];
  const last = points[points.length - 1];
  ctx.save();
  if (first !== undefined && last !== undefined) {
    ctx.strokeStyle = PROFILE_BASE_STROKE;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    ctx.lineTo(last.x, first.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.lineJoin = 'round';
  ctx.strokeStyle = PROFILE_STROKE;
  ctx.lineWidth = PROFILE_LINE_W;
  strokePolyline(ctx, points);
  ctx.fillStyle = LEADER_FILL;
  ctx.beginPath();
  ctx.arc(marker.x, marker.y, PROFILE_MARKER_R, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// ── 중앙 띠 ───────────────────────────────────────────────────────────
function clipToRect(ctx: CanvasRenderingContext2D, r: Rect): void {
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
}

/** 펄롱 표지(점선 + 'nf' 라벨)와 결승 기둥('F'). model.poles 는 카메라 창 안의 것만 온다. */
function drawPoles(ctx: CanvasRenderingContext2D, model: StripModel): void {
  const r = model.center.rect;
  // 출발선의 표지(게이트 자리, 출발선에서 0.3m 안)는 게이트가 대신하므로 게이트가 보이는 동안 그리지 않는다
  const gateX = model.gate?.x ?? null;
  for (const pole of model.poles) {
    if (gateX !== null && Math.abs(pole.x - gateX) <= DISC_RADIUS) continue;
    if (pole.label === FINISH_LABEL) {
      drawFinishPost(ctx, pole.x, r);
    } else {
      drawFurlongPole(ctx, pole.x, pole.label, r);
    }
  }
}

function drawFurlongPole(ctx: CanvasRenderingContext2D, x: number, label: string, r: Rect): void {
  ctx.save();
  ctx.strokeStyle = POLE_STROKE;
  ctx.lineWidth = 1;
  ctx.setLineDash([...POLE_DASH]);
  ctx.beginPath();
  ctx.moveTo(x, r.y);
  ctx.lineTo(x, r.y + r.h);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = FONT_POLE;
  ctx.fillStyle = TEXT_MAIN;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(label, x, r.y + LABEL_TOP_Y);
  ctx.restore();
}

/** 결승선: 체크 무늬 기둥. 라벨 줄 아래에서 시작해 'F' 가 체크 위에 겹치지 않게 한다. */
function drawFinishPost(ctx: CanvasRenderingContext2D, x: number, r: Rect): void {
  ctx.save();
  const left = x - FINISH_POST_W / 2;
  const top = r.y + TEXT_LINE_H;
  const cols = 2;
  const colW = FINISH_POST_W / cols;
  const rows = Math.ceil((r.y + r.h - top) / FINISH_CHECK_PX);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      ctx.fillStyle = (row + col) % 2 === 0 ? FINISH_CHECK_LIGHT : FINISH_CHECK_DARK;
      ctx.fillRect(left + col * colW, top + row * FINISH_CHECK_PX, colW, FINISH_CHECK_PX);
    }
  }
  ctx.font = FONT_POLE;
  ctx.fillStyle = TEXT_MAIN;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(FINISH_LABEL, x, r.y + LABEL_TOP_Y);
  ctx.restore();
}

/**
 * 출발 게이트. loading·ready 는 칸 틀과 칸 번호(1 = 내측 = 아래), ready 는 '출발 준비'.
 * open 은 앞 테두리 자리에 밝은 선(출발 직후 0.35s). left 는 앞문이 열린 채 뒤에 남아 카메라와 함께 흐른다.
 * 게이트가 띠 밖으로 나가면 model.gate 가 null 이라 그리지 않는다.
 */
function drawGate(ctx: CanvasRenderingContext2D, model: StripModel): void {
  const gate = model.gate;
  if (gate === null || gate.stalls.length === 0) return;
  const r = model.center.rect;
  const stalls = gate.stalls;
  const top = Math.min(...stalls) - DISC_RADIUS - GATE_PAD_Y;
  const bottom = Math.max(...stalls) + DISC_RADIUS + GATE_PAD_Y;
  // 앞문: 출발선 쪽 원판 바깥 가장자리. 뒤벽: 로딩 중 원판이 있는 뒤쪽 가장자리.
  const door = gate.x + DISC_RADIUS;
  const back = gate.x - GATE_SLIDE_PX - DISC_RADIUS;

  ctx.save();
  ctx.fillStyle = GATE_FILL;
  ctx.fillRect(back, top, door - back, bottom - top);

  // 칸 사이 구분선(칸 y 의 중간)
  ctx.strokeStyle = GATE_DIVIDER;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let k = 1; k < stalls.length; k++) {
    const a = stalls[k - 1];
    const b = stalls[k];
    if (a === undefined || b === undefined) continue;
    const y = (a + b) / 2;
    ctx.moveTo(back, y);
    ctx.lineTo(door, y);
  }
  ctx.stroke();

  // 칸 번호(작게), 틀 바깥 왼쪽. index 0 = draw 1 = 내측 = 아래.
  ctx.font = FONT_GATE_NO;
  ctx.fillStyle = TEXT_MAIN;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  stalls.forEach((y, i) => {
    ctx.fillText(String(i + 1), back - GATE_NO_GAP_PX, y);
  });

  // 틀: 뒤·위·아래 테두리. 앞문(loading·ready)은 테두리를 그리고, open 은 밝은 선, left 는 열린 앞문(테두리 없음).
  ctx.strokeStyle = GATE_FRAME;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(door, top);
  ctx.lineTo(back, top);
  ctx.lineTo(back, bottom);
  ctx.lineTo(door, bottom);
  ctx.stroke();
  if (gate.phase === 'loading' || gate.phase === 'ready') {
    ctx.beginPath();
    ctx.moveTo(door, top);
    ctx.lineTo(door, bottom);
    ctx.stroke();
  } else if (gate.phase === 'open') {
    ctx.strokeStyle = GATE_OPEN_LINE;
    ctx.lineWidth = GATE_OPEN_LINE_W;
    ctx.beginPath();
    ctx.moveTo(door, top);
    ctx.lineTo(door, bottom);
    ctx.stroke();
  }

  // 출발 준비 글자: 띠 왼쪽 아래(빈 공간). 칸 가운데와 겹치지 않게 둔다.
  if (gate.phase === 'ready') {
    ctx.font = FONT_GATE_LABEL;
    ctx.fillStyle = TEXT_MAIN;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('출발 준비', r.x + GATE_LABEL_INSET_PX, r.y + r.h - GATE_LABEL_INSET_PX);
  }
  ctx.restore();
}

/** 잔디 줄무늬. 카메라 창(camera.from~to)을 progress 로 보고 홀수 칸(STRIPE_M 단위)을 칠한다. */
function drawStripes(ctx: CanvasRenderingContext2D, model: StripModel): void {
  const r = model.center.rect;
  const { from, to } = model.center.camera;
  const span = to - from;
  if (!(span > 0)) return;
  const xOf = (p: number): number => r.x + ((p - from) / span) * r.w;
  ctx.fillStyle = STRIPE_FILL[model.surface];
  for (let k = Math.floor(from / STRIPE_M); k * STRIPE_M < to; k++) {
    if (((k % 2) + 2) % 2 !== 1) continue;
    const x0 = xOf(k * STRIPE_M);
    const x1 = xOf((k + 1) * STRIPE_M);
    ctx.fillRect(x0, r.y, x1 - x0, r.h);
  }
}

function drawCenter(ctx: CanvasRenderingContext2D, model: StripModel): void {
  const { center } = model;
  const r = center.rect;
  ctx.save();
  ctx.fillStyle = TRACK_BG[model.surface];
  ctx.fillRect(r.x, r.y, r.w, r.h);
  clipToRect(ctx, r);
  drawStripes(ctx, model);

  // 레일: 내측(아래) 흰 선, 외측(위) 옅은 선
  ctx.lineWidth = RAIL_W;
  ctx.strokeStyle = RAIL_OUTER_STROKE;
  ctx.beginPath();
  ctx.moveTo(r.x, r.y + RAIL_INSET_PX);
  ctx.lineTo(r.x + r.w, r.y + RAIL_INSET_PX);
  ctx.stroke();
  ctx.strokeStyle = RAIL_INNER_STROKE;
  ctx.beginPath();
  ctx.moveTo(r.x, r.y + r.h - RAIL_INSET_PX);
  ctx.lineTo(r.x + r.w, r.y + r.h - RAIL_INSET_PX);
  ctx.stroke();

  drawPoles(ctx, model);
  drawGate(ctx, model);

  // 진행 방향
  ctx.font = FONT_BOLD;
  ctx.fillStyle = TEXT_MAIN;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText('→', r.x + r.w - PANEL_PAD, r.y + LABEL_TOP_Y);

  // 구간 기록(작은 글씨): 화살표 왼쪽
  if (center.split !== null) {
    ctx.font = FONT_SPLIT;
    ctx.fillStyle = TEXT_MAIN;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(`구간 ${center.split}`, r.x + r.w - SPLIT_INSET_X, r.y + LABEL_TOP_Y);
  }
  ctx.restore();
}

/**
 * 승부복 원판 위에 번호를 그린다. 가독을 위해 번호 뒤에 주색 작은 원을 둔다.
 * 호출 후 font·align·baseline 상태가 바뀌므로 다음 글자는 각자 설정한다.
 */
function drawNumberedDisc(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  silks: Silks,
  label: string,
  font: string,
): void {
  drawSilksDisc(ctx, x, y, r, silks);
  const badgeR = r * NUMBER_BADGE_RATIO;
  ctx.beginPath();
  ctx.arc(x, y, badgeR, 0, TAU);
  ctx.fillStyle = silks.primary;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = discBorderFor(silks.primary);
  ctx.stroke();
  ctx.font = font;
  ctx.fillStyle = textColorFor(silks.primary);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y);
}

/** 원판 한 개. 그림자(1px 아래 어두운 원) → 승부복 원판 → 내 말이면 강조 링. */
function drawDisc(ctx: CanvasRenderingContext2D, d: DiscPlacement): void {
  ctx.save();
  ctx.globalAlpha = d.alpha;
  ctx.beginPath();
  ctx.arc(d.x, d.y + DISC_SHADOW_PX, DISC_RADIUS, 0, TAU);
  ctx.fillStyle = DISC_SHADOW;
  ctx.fill();
  drawNumberedDisc(ctx, d.x, d.y, DISC_RADIUS, d.silks, d.label, FONT_DISC_LABEL);
  if (d.isPlayer) {
    ctx.beginPath();
    ctx.arc(d.x, d.y, DISC_RADIUS + PLAYER_RING_OFFSET, 0, TAU);
    ctx.lineWidth = PLAYER_RING_W;
    ctx.strokeStyle = PLAYER_RING;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * 원판 그리기. 순서는 placeDiscs 반환 순서(레인 바깥 → 안쪽, 안쪽이 위에 그려진다)를 그대로 쓴다.
 * 순서를 여기서 다시 정렬하지 않는다(프레임마다 순서가 뒤바뀌면 번쩍임이 생긴다).
 */
function drawDiscs(ctx: CanvasRenderingContext2D, model: StripModel): void {
  ctx.save();
  clipToRect(ctx, model.center.rect);
  for (const d of model.center.discs) {
    drawDisc(ctx, d);
  }
  ctx.restore();
}

/** 글자 폭 근사(px). 한글·한자 등 넓은 글자는 TAG_WIDE_CHAR_PX, 그 밖은 TAG_NARROW_CHAR_PX. */
function approxTextWidth(text: string): number {
  let w = 0;
  for (const ch of text) {
    w += ch.charCodeAt(0) > 0x7f ? TAG_WIDE_CHAR_PX : TAG_NARROW_CHAR_PX;
  }
  return w;
}

/** 이름표 상자의 좌상단과 폭. above: 원판 위쪽 가운데. right: 게이트 앞문 바깥(세로 가운데 정렬). */
function tagBox(tag: PlayerTag, w: number, r: Rect): { x: number; y: number } {
  if (tag.placement === 'right') {
    return {
      x: Math.min(tag.x, r.x + r.w - w - 2),
      y: Math.min(Math.max(r.y + 1, tag.y - TAG_H / 2), r.y + r.h - TAG_H - 1),
    };
  }
  return {
    x: Math.min(Math.max(tag.x - w / 2, r.x + 2), r.x + r.w - w - 2),
    y: Math.max(r.y + 1, tag.y - TAG_H),
  };
}

/** 내 말 이름표. 작은 둥근 상자에 말 이름만 쓴다(다른 말 이름은 그리지 않는다). */
function drawPlayerTags(ctx: CanvasRenderingContext2D, model: StripModel): void {
  const r = model.center.rect;
  ctx.save();
  for (const tag of model.playerTags) {
    const w = Math.min(TAG_MAX_W, approxTextWidth(tag.name) + 2 * TAG_PAD_X);
    const { x, y } = tagBox(tag, w, r);
    roundedRectPath(ctx, x, y, w, TAG_H, TAG_H / 2);
    ctx.fillStyle = TAG_FILL;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = PLAYER_RING;
    ctx.stroke();
    ctx.font = FONT_TAG;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tag.name, x + w / 2, y + TAG_H / 2, TAG_MAX_W);
  }
  ctx.restore();
}

/**
 * 사진 판정 컷. 결승선 세로선 위에 승자 원판(결승선 위), 2착 원판(착차만큼 뒤)을 둔다.
 * 착차는 PHOTO_PX_PER_M 배로 확대해 픽셀로 보인다. 패널 밖으로 나가지 않도록 최대 거리로 자른다.
 */
function drawPhotoCut(ctx: CanvasRenderingContext2D, model: StripModel): void {
  const cut = model.center.photoCut;
  if (cut === null) return;
  const winner = model.center.discs.find((d) => d.runnerIndex === cut.winner);
  const second = model.center.discs.find((d) => d.runnerIndex === cut.second);
  if (winner === undefined || second === undefined) return;

  const r = model.center.rect;
  const w = Math.min(PHOTO_PANEL_W, r.w - 2 * PANEL_PAD);
  const h = Math.min(PHOTO_PANEL_H, r.h - 2 * PANEL_PAD);
  const px = r.x + (r.w - w) / 2;
  const py = r.y + (r.h - h) / 2;
  const xFinish = px + w / 2;
  const bodyTop = py + PHOTO_TITLE_H;
  const bodyH = h - PHOTO_TITLE_H;
  const winnerY = bodyTop + bodyH * PHOTO_LANE_WINNER;
  const secondY = bodyTop + bodyH * PHOTO_LANE_SECOND;
  const maxOffset = Math.max(0, w / 2 - PHOTO_DISC_R - PANEL_PAD);
  const offset = Math.min(Math.max(0, cut.gapM) * PHOTO_PX_PER_M, maxOffset);

  ctx.save();
  ctx.fillStyle = PHOTO_PANEL_FILL;
  roundedRectPath(ctx, px, py, w, h, PHOTO_PANEL_RADIUS);
  ctx.fill();

  // 결승선
  ctx.strokeStyle = FINISH_STROKE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(xFinish, bodyTop);
  ctx.lineTo(xFinish, py + h);
  ctx.stroke();

  ctx.font = FONT_PHOTO;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('사진 판정', px + w / 2, py + PHOTO_TITLE_H / 2);

  drawNumberedDisc(ctx, xFinish, winnerY, PHOTO_DISC_R, winner.silks, winner.label, FONT_DISC_LABEL);
  drawNumberedDisc(ctx, xFinish - offset, secondY, PHOTO_DISC_R, second.silks, second.label, FONT_DISC_LABEL);
  ctx.restore();
}

// ── 우측 패널 ─────────────────────────────────────────────────────────
function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** 상위 행이 시작하는 y. 제목이 있으면(출발 전) 제목 줄만큼 내린다. */
function rowsTopOf(model: StripModel): number {
  return model.right.heading !== null ? ROW_TOP + HEADING_H : ROW_TOP;
}

function drawStandingRow(
  ctx: CanvasRenderingContext2D,
  row: StandingRow,
  index: number,
  rowsTop: number,
  x0: number,
  xEnd: number,
): void {
  const top = rowsTop + index * ROW_H;
  const cy = top + ROW_DISC_R + 2;

  ctx.save();
  drawNumberedDisc(ctx, x0 + ROW_DISC_R, cy, ROW_DISC_R, row.silks, String(row.saddleCloth), FONT_ROW_NO);

  const tx = x0 + ROW_TEXT_X;
  ctx.font = FONT_ROW_MARGIN;
  ctx.fillStyle = TEXT_MAIN;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(row.marginText, tx, cy + 4);
  ctx.textAlign = 'right';
  ctx.fillText(row.oddsText, xEnd, cy + 4);

  ctx.font = FONT_ROW_NAME;
  ctx.fillStyle = TEXT_MUTED;
  ctx.textAlign = 'left';
  ctx.fillText(row.horseName, tx, cy + 18, xEnd - tx);
  ctx.restore();
}

/**
 * 상위 3두 아래: 구분선, '내 말 N위 · 선두와 X' 한 줄(3위 안이면 금색 강조), 결승까지 진행 막대.
 * 결과판이 떠 있을 때는 그리지 않는다.
 */
function drawStanding(ctx: CanvasRenderingContext2D, model: StripModel, x0: number, xEnd: number): void {
  const ruleY = rowsTopOf(model) + model.right.rows.length * ROW_H + STANDING_GAP_Y;
  ctx.save();
  ctx.strokeStyle = SEPARATOR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0, ruleY);
  ctx.lineTo(xEnd, ruleY);
  ctx.stroke();

  const me = model.myStanding;
  if (me !== null) {
    const top3 = me.position <= 3;
    ctx.font = top3 ? FONT_STANDING_HI : FONT_SMALL;
    ctx.fillStyle = top3 ? PLAYER_RING : TEXT_MAIN;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const text =
      me.behind === null
        ? `내 말 ${me.position}위 · 선두`
        : `내 말 ${me.position}위 · 선두와 ${me.behind}`;
    ctx.fillText(text, x0, ruleY + STANDING_TEXT_DY, xEnd - x0);
  }

  // 출발 전: 내 말의 인기 순위와 오즈(착순이 없으므로 '내 말 N위' 대신 '내 말 N번 인기')
  const fav = model.myFavourite;
  if (fav !== null) {
    const top3 = fav.rank <= 3;
    ctx.font = top3 ? FONT_STANDING_HI : FONT_SMALL;
    ctx.fillStyle = top3 ? PLAYER_RING : TEXT_MAIN;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`내 말 ${fav.rank}번 인기 · ${fav.oddsText}`, x0, ruleY + STANDING_TEXT_DY, xEnd - x0);
  }

  // 진행 막대: 선두의 결승까지 비율. 고저 단면의 선두 표식 x 를 단면 띠 폭으로 환산한다(s / distance).
  const band = profileRect(model.height);
  const frac = Math.min(1, Math.max(0, (model.left.profile.marker.x - band.x) / band.w));
  const barY = ruleY + STANDING_BAR_DY;
  const barW = xEnd - x0;
  ctx.fillStyle = PROGRESS_TRACK;
  ctx.fillRect(x0, barY, barW, PROGRESS_H);
  ctx.fillStyle = PROGRESS_FILL;
  ctx.fillRect(x0, barY, barW * frac, PROGRESS_H);
  ctx.restore();
}

/** 결과판머리글과 상위 행. OR 열은 어느 행에든 OR 변동이 있을 때만 그린다. */
function drawBoard(ctx: CanvasRenderingContext2D, board: BoardRow[], x0: number, xEnd: number): void {
  const hasRating = board.some((row) => row.ratingText !== null);
  ctx.save();
  ctx.font = FONT_BOARD_HEAD;
  ctx.fillStyle = TEXT_MUTED;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';
  ctx.fillText('착순', x0 + BOARD_POS_X, BOARD_HEAD_Y);
  ctx.textAlign = 'left';
  ctx.fillText('마명', x0 + BOARD_NAME_X, BOARD_HEAD_Y);
  ctx.textAlign = 'right';
  ctx.fillText('착차', x0 + BOARD_MARGIN_RIGHT_X, BOARD_HEAD_Y);
  ctx.fillText('SP', x0 + BOARD_ODDS_RIGHT_X, BOARD_HEAD_Y);
  if (hasRating) ctx.fillText('OR', xEnd, BOARD_HEAD_Y);
  ctx.restore();

  board.forEach((row, i) => {
    drawBoardRow(ctx, row, i, x0, xEnd, hasRating);
  });
}

function drawBoardRow(
  ctx: CanvasRenderingContext2D,
  row: BoardRow,
  index: number,
  x0: number,
  xEnd: number,
  hasRating: boolean,
): void {
  const cy = BOARD_TOP + index * BOARD_ROW_H + BOARD_ROW_H / 2;
  const baseline = cy + 4;

  ctx.save();
  ctx.font = FONT_BOARD_POS;
  ctx.fillStyle = TEXT_MAIN;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(String(row.position), x0 + BOARD_POS_X, baseline);

  drawNumberedDisc(ctx, x0 + BOARD_DISC_X, cy, ROW_DISC_R, row.silks, String(row.saddleCloth), FONT_ROW_NO);

  ctx.font = FONT_BOARD_CELL;
  ctx.fillStyle = row.isPlayer ? PLAYER_RING : TEXT_MAIN;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(row.horseName, x0 + BOARD_NAME_X, baseline, BOARD_NAME_W);

  ctx.fillStyle = TEXT_MAIN;
  ctx.textAlign = 'right';
  ctx.fillText(row.marginText, x0 + BOARD_MARGIN_RIGHT_X, baseline, BOARD_MARGIN_W);
  ctx.fillText(row.oddsText, x0 + BOARD_ODDS_RIGHT_X, baseline, BOARD_ODDS_W);

  if (hasRating && row.ratingText !== null) {
    ctx.fillStyle = TEXT_MUTED;
    ctx.fillText(row.ratingText, xEnd, baseline, BOARD_RATING_W);
  }
  ctx.restore();
}

function drawRightPanel(ctx: CanvasRenderingContext2D, model: StripModel): void {
  const { right } = model;
  const rightX = model.center.rect.x + model.center.rect.w;
  const x0 = rightX + PANEL_PAD;
  const xEnd = model.width - PANEL_PAD;
  const bottomY = model.height - 30;

  ctx.save();
  if (right.board !== null) {
    drawBoard(ctx, right.board, x0, xEnd);
  } else {
    if (right.heading !== null) {
      ctx.font = FONT_HEADING;
      ctx.fillStyle = TEXT_MUTED;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(right.heading, x0, ROW_TOP + HEADING_BASELINE_Y, xEnd - x0);
    }
    const rowsTop = rowsTopOf(model);
    right.rows.forEach((row, i) => {
      drawStandingRow(ctx, row, i, rowsTop, x0, xEnd);
    });
    drawStanding(ctx, model, x0, xEnd);
  }

  let nameX = x0;
  if (right.gradeBadge !== null) {
    ctx.save();
    roundedRectPath(ctx, x0, bottomY - BADGE_H + 3, BADGE_W, BADGE_H, BADGE_H / 2);
    ctx.fillStyle = BADGE_FILL;
    ctx.fill();
    ctx.font = FONT_ROW_NO;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(right.gradeBadge, x0 + BADGE_W / 2, bottomY - BADGE_H / 2 + 3);
    ctx.restore();
    nameX = x0 + BADGE_W + 8;
  }

  ctx.font = FONT_RACE_NAME;
  ctx.fillStyle = TEXT_MAIN;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(right.raceName, nameX, bottomY, Math.max(10, xEnd - nameX));

  ctx.font = FONT_COURSE;
  ctx.fillStyle = TEXT_MUTED;
  ctx.fillText(right.courseName, x0, model.height - 10, Math.max(10, xEnd - x0));
  ctx.restore();
}
