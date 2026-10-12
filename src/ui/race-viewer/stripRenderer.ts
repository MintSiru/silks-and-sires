/**
 * 레이스 띠 뷰어 그리기. CanvasRenderingContext2D 에 그리기만 하며 상태를 계산하지 않는다.
 * 외부 이미지·폰트는 쓰지 않는다(system-ui).
 */
import type { PathPoint } from '../../engine/types';
import { DISC_RADIUS, discBorderFor, PROFILE_H, STRIP_BG, textColorFor } from './viewModel';
import type { DiscPlacement, Rect, StandingRow, StripModel } from './viewModel';

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
const RAIL_STROKE = '#55626f';
const POLE_STROKE = '#8a96a3';
const FINISH_STROKE = '#e5484d';
const PLAYER_RING = '#f5c518';
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
const FONT_PHOTO = 'bold 14px system-ui';
const ROW_TOP = 12;
const ROW_H = 40;
const ROW_DISC_R = 8;
const ROW_TEXT_X = 24;
const BADGE_W = 44;
const BADGE_H = 16;
const BADGE_FILL = '#3b5b7a';
const PHOTO_BOX_W = 84;
const PHOTO_BOX_H = 22;
const PHOTO_BOX_FILL = 'rgba(0, 0, 0, 0.7)';
const LABEL_TOP_Y = 3;

/** 그리기 한 번을 감싸는 공통 헬퍼: 모든 상태 변경은 save/restore 안에서 한다. */
export function drawStrip(ctx: CanvasRenderingContext2D, model: StripModel): void {
  ctx.save();
  drawBackground(ctx, model);
  drawLeftPanel(ctx, model);
  drawCenter(ctx, model);
  drawDiscs(ctx, model);
  drawPhoto(ctx, model);
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
  ctx.arc(lp.x, lp.y, MINIMAP_DOT_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 코스 정보 4줄
  const lines = [
    left.distanceLabel,
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
  ctx.arc(marker.x, marker.y, PROFILE_MARKER_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ── 중앙 띠 ───────────────────────────────────────────────────────────
function clipToRect(ctx: CanvasRenderingContext2D, r: Rect): void {
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
}

function drawCenter(ctx: CanvasRenderingContext2D, model: StripModel): void {
  const { center } = model;
  const r = center.rect;
  ctx.save();
  ctx.fillStyle = STRIP_BG;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  clipToRect(ctx, r);

  // 내측 레일 선 (lane 0 원판 중심과 같은 높이)
  const railY = r.y + r.h - DISC_RADIUS;
  ctx.strokeStyle = RAIL_STROKE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(r.x, railY);
  ctx.lineTo(r.x + r.w, railY);
  ctx.stroke();

  // 펄롱 표지
  ctx.strokeStyle = POLE_STROKE;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  for (const pole of center.poles) {
    ctx.beginPath();
    ctx.moveTo(pole.x, r.y);
    ctx.lineTo(pole.x, r.y + r.h);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.font = FONT_SMALL;
  ctx.fillStyle = TEXT_MUTED;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const pole of center.poles) {
    ctx.fillText(pole.label, pole.x, r.y + LABEL_TOP_Y);
  }

  // 결승선
  if (center.finishX !== null) {
    ctx.strokeStyle = FINISH_STROKE;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(center.finishX, r.y);
    ctx.lineTo(center.finishX, r.y + r.h);
    ctx.stroke();
  }

  // 진행 방향
  ctx.font = FONT_BOLD;
  ctx.fillStyle = TEXT_MUTED;
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

function drawDisc(ctx: CanvasRenderingContext2D, d: DiscPlacement): void {
  ctx.save();
  ctx.globalAlpha = d.alpha;
  ctx.beginPath();
  ctx.arc(d.x, d.y, DISC_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = d.fill;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = d.border;
  ctx.stroke();
  if (d.isPlayer) {
    ctx.beginPath();
    ctx.arc(d.x, d.y, DISC_RADIUS + 1, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = PLAYER_RING;
    ctx.stroke();
  }
  ctx.font = FONT_DISC_LABEL;
  ctx.fillStyle = d.textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(d.label, d.x, d.y);
  ctx.restore();
}

function drawDiscs(ctx: CanvasRenderingContext2D, model: StripModel): void {
  ctx.save();
  clipToRect(ctx, model.center.rect);
  // discs 는 progress 오름차순(뒤쪽 먼저)으로 들어온다
  for (const d of model.center.discs) {
    drawDisc(ctx, d);
  }
  ctx.restore();
}

function drawPhoto(ctx: CanvasRenderingContext2D, model: StripModel): void {
  if (!model.right.photo) return;
  const r = model.center.rect;
  const cx = r.x + r.w / 2;
  const top = r.y + 4;
  ctx.save();
  ctx.fillStyle = PHOTO_BOX_FILL;
  ctx.fillRect(cx - PHOTO_BOX_W / 2, top, PHOTO_BOX_W, PHOTO_BOX_H);
  ctx.font = FONT_PHOTO;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PHOTO', cx, top + PHOTO_BOX_H / 2);
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

function drawStandingRow(
  ctx: CanvasRenderingContext2D,
  row: StandingRow,
  index: number,
  x0: number,
  xEnd: number,
): void {
  const top = ROW_TOP + index * ROW_H;
  const cy = top + ROW_DISC_R + 2;
  const fill = row.silksPrimary;

  ctx.save();
  ctx.beginPath();
  ctx.arc(x0 + ROW_DISC_R, cy, ROW_DISC_R, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = discBorderFor(fill);
  ctx.stroke();
  ctx.font = FONT_ROW_NO;
  ctx.fillStyle = textColorFor(fill);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(row.saddleCloth), x0 + ROW_DISC_R, cy);

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

function drawRightPanel(ctx: CanvasRenderingContext2D, model: StripModel): void {
  const { right } = model;
  const rightX = model.center.rect.x + model.center.rect.w;
  const x0 = rightX + PANEL_PAD;
  const xEnd = model.width - PANEL_PAD;
  const bottomY = model.height - 30;

  ctx.save();
  right.rows.forEach((row, i) => {
    drawStandingRow(ctx, row, i, x0, xEnd);
  });

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
