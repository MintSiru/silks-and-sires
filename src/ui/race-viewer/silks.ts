/**
 * 승부복 원판 그리기. CanvasRenderingContext2D 에 그리기만 하며 상태를 계산하지 않는다.
 * 무늬는 모두 원 안으로 clip 한 뒤 그린다. 기하는 원 반지름 r 에 대한 비율로 둔다.
 */
import type { Silks, SilksPattern } from '../../engine/types';
import { discBorderFor } from './viewModel';

// ── 그리기 비율 (반지름 r 기준, 표시용) ───────────────────────────────
/** 가로 띠(hoops)·세로 줄(stripes)의 시작 위치(중심 기준) 와 두께 */
const BAND_OFFSETS: readonly number[] = [-0.7, -0.1, 0.5];
const BAND_W = 0.4;
/** 대각선 띠(sash) 두께 */
const SASH_W = 0.45;
/** V자(chevrons) 선 두께와 두 팔 간격·높이 */
const CHEVRON_LINE_W = 0.22;
const CHEVRON_HALF_SPAN = 0.9;
const CHEVRON_DEPTH = 0.5;
/** V자 두 개의 꼭짓점 높이(중심 기준) */
const CHEVRON_APEX_Y: readonly number[] = [-0.45, 0.25];
/** 점(spots) 반지름과 중심 기준 위치 (5개) */
const SPOT_R = 0.18;
const SPOT_OFFSETS: readonly (readonly [number, number])[] = [
  [0, 0],
  [-0.5, -0.5],
  [0.5, -0.5],
  [-0.5, 0.5],
  [0.5, 0.5],
];
/** 별(star) 바깥·안쪽 반지름과 꼭짓점 수 */
const STAR_OUTER = 0.55;
const STAR_INNER = 0.23;
const STAR_POINTS = 5;
/** 테두리 선 두께 */
const BORDER_LINE_W = 1;

function circlePath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

function drawHoops(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  for (const off of BAND_OFFSETS) {
    ctx.fillRect(x - r, y + off * r, 2 * r, BAND_W * r);
  }
}

function drawStripes(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  for (const off of BAND_OFFSETS) {
    ctx.fillRect(x + off * r, y - r, BAND_W * r, 2 * r);
  }
}

/** 4분할 교차색: 좌상·우하 사분면을 보조색으로 (주색 바탕 위) */
function drawQuartered(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.fillRect(x - r, y - r, r, r);
  ctx.fillRect(x, y, r, r);
}

function drawSash(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.lineWidth = SASH_W * r;
  ctx.beginPath();
  ctx.moveTo(x - r, y - r);
  ctx.lineTo(x + r, y + r);
  ctx.stroke();
}

function drawChevrons(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.lineWidth = CHEVRON_LINE_W * r;
  ctx.lineJoin = 'miter';
  for (const apex of CHEVRON_APEX_Y) {
    ctx.beginPath();
    ctx.moveTo(x - CHEVRON_HALF_SPAN * r, y + (apex + CHEVRON_DEPTH) * r);
    ctx.lineTo(x, y + apex * r);
    ctx.lineTo(x + CHEVRON_HALF_SPAN * r, y + (apex + CHEVRON_DEPTH) * r);
    ctx.stroke();
  }
}

function drawSpots(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  for (const [dx, dy] of SPOT_OFFSETS) {
    ctx.beginPath();
    ctx.arc(x + dx * r, y + dy * r, SPOT_R * r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const n = STAR_POINTS * 2;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const rad = (i % 2 === 0 ? STAR_OUTER : STAR_INNER) * r;
    const angle = -Math.PI / 2 + (i * Math.PI) / STAR_POINTS;
    const px = x + rad * Math.cos(angle);
    const py = y + rad * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

/** 무늬 한 종류를 보조색으로 그린다. plain 은 아무것도 그리지 않는다(주색 바탕만). */
function drawPattern(
  ctx: CanvasRenderingContext2D,
  pattern: SilksPattern,
  x: number,
  y: number,
  r: number,
): void {
  switch (pattern) {
    case 'plain':
      return;
    case 'hoops':
      drawHoops(ctx, x, y, r);
      return;
    case 'stripes':
      drawStripes(ctx, x, y, r);
      return;
    case 'quartered':
      drawQuartered(ctx, x, y, r);
      return;
    case 'sash':
      drawSash(ctx, x, y, r);
      return;
    case 'chevrons':
      drawChevrons(ctx, x, y, r);
      return;
    case 'spots':
      drawSpots(ctx, x, y, r);
      return;
    case 'star':
      drawStar(ctx, x, y, r);
      return;
  }
}

/**
 * 승부복 원판. 원 안을 주색 바탕 + 보조색 무늬로 칠하고, 테두리는 주색 대비에 따라 고른다(discBorderFor).
 * 무늬는 원 밖으로 나가지 않도록 clip 안에서 그린다. 번호 글자는 호출자가 그린다.
 */
export function drawSilksDisc(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  silks: Silks,
): void {
  ctx.save();
  circlePath(ctx, x, y, r);
  ctx.clip();
  ctx.fillStyle = silks.primary;
  ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  ctx.fillStyle = silks.secondary;
  ctx.strokeStyle = silks.secondary;
  drawPattern(ctx, silks.pattern, x, y, r);
  ctx.restore();

  // 테두리는 clip 밖에서 그려야 반쪽이 잘리지 않는다
  ctx.save();
  circlePath(ctx, x, y, r);
  ctx.lineWidth = BORDER_LINE_W;
  ctx.strokeStyle = discBorderFor(silks.primary);
  ctx.stroke();
  ctx.restore();
}
