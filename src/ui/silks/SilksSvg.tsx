import { useId } from 'react';
import type { JSX } from 'react';
import type { SilksDesign } from '../../engine/types';

// 도안 좌표(98 × 71, 사용자 참고 SVG 의 구성 2026-10-16 — 경로는 새로 그림): 홈 파인 목깃의 몸통, 곡선 진동 둘레로 이어진 소매,
// 오른쪽에 위에서 본 모자(둥근 크라운 + 아래 챙). 무늬는 각 부분의 box(x, y, w, h)에 100 × 100 좌표를 늘려 그린다.
const CAP_CROWN = { cx: 84, cy: 19, r: 9.5 } as const;
const CAP_PEAK_PATH = 'M74.71 21 A9.5 9.5 0 0 0 93.29 21 A9.6 16 0 0 1 74.71 21 Z';
const GEOMETRY = {
  viewBox: '0 0 98 71', width: 98, height: 71,
  // poly: 점·별 무늬 배치용 근사 다각형(곡선을 직선으로 줄인 것)
  body: { name: 'body', axis: null, poly: [[13, 11], [19.5, 30], [19.5, 70], [60, 70], [60, 30], [66.5, 11], [49.5, 4.5], [30, 4.5]], path: 'M13 11 C17.5 14 19.5 24 19.5 30 L19.5 70 L60 70 L60 30 C60 24 62 14 66.5 11 L49.5 4.5 L49.5 0.5 '
    + 'C44.5 0.5 40.5 2.5 39.75 6.5 C39 2.5 35 0.5 30 0.5 L30 4.5 Z', box: [13, 0.5, 53.5, 69.5] },
  // axis: 소매 가운데 선(어깨 → 소맷부리). 소매의 점·별은 이 선을 따라 고르게 놓는다.
  left: { name: 'left', axis: [[14.1, 21], [7.5, 64]], poly: [[13, 11], [17.5, 22], [19.4, 35.8], [12.6, 69.6], [0.6, 67.6]], path: 'M13 11 C16.5 12.5 20 24 19.4 35.8 C18.5 42 14 66 12.6 69.6 L0.6 67.6 Z', box: [0.6, 11, 19.4, 58.6] },
  right: { name: 'right', axis: [[65.4, 21], [72, 64]], poly: [[66.5, 11], [62, 22], [60.1, 35.8], [66.9, 69.6], [78.9, 67.6]], path: 'M66.5 11 C63 12.5 59.5 24 60.1 35.8 C61 42 65.5 66 66.9 69.6 L78.9 67.6 Z', box: [59.5, 11, 19.4, 58.6] },
  cap: { name: 'cap', axis: null, poly: null, path: `M${CAP_CROWN.cx - CAP_CROWN.r} ${CAP_CROWN.cy} A${CAP_CROWN.r} ${CAP_CROWN.r} 0 1 0 ${CAP_CROWN.cx + CAP_CROWN.r} ${CAP_CROWN.cy} `
    + `A${CAP_CROWN.r} ${CAP_CROWN.r} 0 1 0 ${CAP_CROWN.cx - CAP_CROWN.r} ${CAP_CROWN.cy} Z`,
    box: [CAP_CROWN.cx - CAP_CROWN.r, CAP_CROWN.cy - CAP_CROWN.r, 2 * CAP_CROWN.r, 2 * CAP_CROWN.r] },
  outline: '#231f20', stroke: 1, borderStroke: 4, band: 14, cell: 20,
  star: '0,-18 5,-6 18,-6 8,3 12,16 0,8 -12,16 -8,3 -18,-6 -5,-6',
} as const;
/** 모자 크라운의 별 여러 개: 가운데 1 + 대각 4(잘리지 않게) */
const CAP_STARS = { size: 2.3, points: [[84, 19], [79.6, 14.6], [88.4, 14.6], [79.6, 23.4], [88.4, 23.4]] } as const;
/**
 * 점·별처럼 모양이 있는 무늬는 box 로 늘리면 찌그러지고 가장자리에서 반쯤 잘리므로, 도안 좌표에서
 * 부분 가운데를 기준으로 엇갈린 격자를 깔고 모양 전체가 부분 안에 드는 자리만 쓴다(spacing·크기는 도안 단위).
 */
const MOTIFS = {
  large_spots: { spacing: 12, size: 4 },
  small_spots: { spacing: 8, size: 2 },
  spots: { spacing: 6.5, size: 1.6 },
  stars: { spacing: 9, size: 3.2 },
} as const;
/** 소매 축을 따라 놓는 간격과 두 줄(점)일 때 축에서 벌리는 거리 */
const SLEEVE_MOTIFS = {
  spots: { spacing: 4.6, size: 1.5, side: 2.2 },
  stars: { spacing: 10, size: 3, side: 0 },
} as const;
/** 몸통 별 하나: 도안 좌표 중심과 반지름 */
const BODY_STAR = { x: 39.75, y: 36, size: 12 } as const;
/**
 * 몸통에 손으로 정한 배치(사용자 피드백 2026-10-16): 큰 점 = 2열 × 3행 6개(실제 승부복 도안식),
 * 별 여러 개 = 3·2·3·2 엇갈림 10개. 좌표는 도안 단위, size 는 반지름.
 */
const BODY_LAYOUTS = {
  large_spots: { size: 6.2, points: [[30.5, 22], [49, 22], [30.5, 40], [49, 40], [30.5, 58], [49, 58]] },
  stars: { size: 4.6, points: [[28.5, 19], [39.75, 19], [51, 19], [34, 32], [45.5, 32],
    [28.5, 45], [39.75, 45], [51, 45], [34, 58], [45.5, 58]] },
} as const;
const STAR_RADIUS = 18;
type Poly = readonly (readonly [number, number])[];

function insidePoly(poly: Poly, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** 반지름 r 원 둘레 8점이 모두 안에 있으면 모양 전체가 든다고 본다 */
function fits(poly: Poly, x: number, y: number, r: number): boolean {
  for (let k = 0; k < 8; k++) {
    const a = (Math.PI * k) / 4;
    if (!insidePoly(poly, x + r * Math.cos(a), y + r * Math.sin(a))) return false;
  }
  return true;
}
function motifShapes(pattern: keyof typeof MOTIFS, poly: Poly, box: readonly number[]): JSX.Element {
  const { spacing, size } = MOTIFS[pattern];
  const [bx, by, bw, bh] = box as [number, number, number, number];
  const cx = bx + bw / 2;
  const items: JSX.Element[] = [];
  const rowStep = spacing * 0.87;
  for (let row = 0, y = by + rowStep / 2; y < by + bh; row++, y += rowStep) {
    const offset = row % 2 === 0 ? 0 : spacing / 2;
    for (let k = -Math.ceil(bw / spacing); k <= Math.ceil(bw / spacing); k++) {
      const x = cx + offset + k * spacing;
      if (!fits(poly, x, y, size + 0.6)) continue;
      const key = `${row}-${k}`;
      items.push(pattern === 'stars'
        ? star(x, y, size / STAR_RADIUS, key)
        : <circle key={key} cx={x} cy={y} r={size} />);
    }
  }
  return <>{items}</>;
}

/** 소매: 축을 따라 같은 간격으로(점은 좌우 번갈아) 놓는다 */
function sleeveMotifs(pattern: 'spots' | 'stars', axis: Poly, poly: Poly): JSX.Element {
  const { spacing, size, side } = SLEEVE_MOTIFS[pattern];
  const [[x1, y1], [x2, y2]] = axis as [[number, number], [number, number]];
  const length = Math.hypot(x2 - x1, y2 - y1);
  const count = Math.floor(length / spacing) + 1;
  const start = (length - (count - 1) * spacing) / 2;
  const [ux, uy] = [(x2 - x1) / length, (y2 - y1) / length];
  const items: JSX.Element[] = [];
  for (let i = 0; i < count; i++) {
    const d = start + i * spacing;
    const shift = side === 0 ? 0 : (i % 2 === 0 ? -side : side);
    const x = x1 + ux * d - uy * shift;
    const y = y1 + uy * d + ux * shift;
    if (!fits(poly, x, y, size + 0.4)) continue;
    items.push(pattern === 'stars' ? star(x, y, size / STAR_RADIUS, String(i)) : <circle key={i} cx={x} cy={y} r={size} />);
  }
  return <>{items}</>;
}

/** 몸통 box 기준 100 좌표에서 목깃 칸(목깃 위 홈 양쪽 + 어깨선까지) */
const COLLAR_BOX = { x: 31.5, y: 0, w: 37, h: 8.6 } as const;

function diamond(x: number, y: number, radius: number, key?: string): JSX.Element {
  return <polygon key={key} points={`${x},${y - radius} ${x + radius},${y} ${x},${y + radius} ${x - radius},${y}`} />;
}
function star(x: number, y: number, scale = 1, key?: string): JSX.Element {
  return <polygon key={key} points={GEOMETRY.star} transform={`translate(${x} ${y}) scale(${scale})`} />;
}
function tiles(shape: 'spots' | 'diamonds' | 'stars' | 'check', step: number = GEOMETRY.cell): JSX.Element {
  const items: JSX.Element[] = [];
  for (let y = 0; y <= 100; y += step) {
    for (let x = 0; x <= 100; x += step) {
      const key = `${x}-${y}`;
      if (shape === 'spots') items.push(<circle key={key} cx={x + step / 2} cy={y + step / 2} r={step / 5} />);
      if (shape === 'diamonds') items.push(diamond(x + step / 2, y + step / 2, step / 2.5, key));
      if (shape === 'stars') items.push(star(x + step / 2, y + step / 2, step / 45, key));
      if (shape === 'check' && (x / step + y / step) % 2 === 0) {
        items.push(<rect key={key} x={x} y={y} width={step} height={step} />);
      }
    }
  }
  return <>{items}</>;
}
function bands(vertical: boolean): JSX.Element {
  return <>{[10, 36, 62, 88].map((offset) => <rect key={offset}
    x={vertical ? offset : 0} y={vertical ? 0 : offset}
    width={vertical ? GEOMETRY.band : 100} height={vertical ? 100 : GEOMETRY.band} />)}</>;
}
function chevrons(offsets: number[]): JSX.Element {
  return <>{offsets.map((y) => <polygon key={y} points={`0,${y} 50,${y + 25} 100,${y} 100,${y + 14} 50,${y + 39} 0,${y + 14}`} />)}</>;
}

/** 몸통·소매·모자가 같은 무늬를 쓸 때도 각 부분 좌표에서 다시 그린다. */
function patternShape(pattern: string): JSX.Element {
  switch (pattern) {
    case 'plain': return <rect width="100" height="100" />;
    case 'hoop': case 'armlet': return <rect y="43" width="100" height={GEOMETRY.band} />;
    case 'hoops': case 'hooped': return bands(false);
    case 'stripes': case 'striped': return bands(true);
    case 'braces': return <><rect x="22" width="14" height="100" /><rect x="64" width="14" height="100" /></>;
    case 'cross_belts': return <><polygon points="0,0 14,0 100,86 100,100 86,100 0,14" /><polygon points="86,0 100,0 100,14 14,100 0,100 0,86" /></>;
    case 'sash': return <polygon points="0,0 20,0 100,80 100,100 80,100 0,20" />;
    case 'diamond': return diamond(50, 50, 30);
    case 'diamonds': return tiles('diamonds', 25);
    case 'triple_diamond': return <>{[22, 50, 78].map((y) => diamond(50, y, 15, String(y)))}</>;
    case 'chevron': return chevrons([30]);
    case 'chevrons': return chevrons([0, 35, 70]);
    case 'epaulets': return <><polygon points="5,13 24,7 35,22 31,31 18,29" /><polygon points="95,13 76,7 65,22 69,31 82,29" /></>;
    case 'halves_vertical': case 'halves': return <rect x="50" width="50" height="100" />;
    case 'halves_horizontal': return <rect y="50" width="100" height="50" />;
    case 'inverted_triangle': return <polygon points="0,0 100,0 50,95" />;
    case 'triangle': return <polygon points="50,5 100,100 0,100" />;
    case 'large_spots': return tiles('spots', 40);
    case 'small_spots': case 'spots': return tiles('spots');
    case 'quartered': return <><rect width="50" height="50" /><rect x="50" y="50" width="50" height="50" /></>;
    case 'seams': return <><rect x="10" width="7" height="100" /><rect x="83" width="7" height="100" /></>;
    case 'star': return star(50, 50, 1.8);
    case 'stars': return tiles('stars', 30);
    case 'check': return tiles('check');
    case 'disc': return <circle cx="50" cy="50" r="28" />;
    case 'cross_of_lorraine': return <><rect x="43" y="12" width="14" height="78" /><rect x="25" y="30" width="50" height="12" /><rect x="15" y="58" width="70" height="12" /></>;
    case 'diabolo': return <polygon points="0,0 100,0 58,50 100,100 0,100 42,50" />;
    case 'collar': return <rect x={COLLAR_BOX.x} y={COLLAR_BOX.y} width={COLLAR_BOX.w} height={COLLAR_BOX.h} />;
    // 테두리는 부분 윤곽선을 따라 그려야 하므로 SilksSvg 가 box 변환 밖에서 그린다.
    case 'border': return <></>;
    case 'armlets': return <><rect y="32" width="100" height="12" /><rect y="59" width="100" height="12" /></>;
    case 'cuffs': return <rect y="78" width="100" height="22" />;
    // 챙은 크라운 밖(아래 초승달)이라 SilksSvg 가 CAP_PEAK_PATH 로 직접 칠한다.
    case 'peak': return <></>;
    case 'pompon': return <circle cx="50" cy="50" r="14" />;
    default: throw new Error(`알 수 없는 승부복 무늬: ${pattern}`);
  }
}

export interface SilksSvgProps { design: SilksDesign; size: number }
export default function SilksSvg({ design, size }: SilksSvgProps): JSX.Element {
  // useId 값의 ':' 등은 url(#…) 참조에서 문제가 될 수 있어 영숫자만 남긴다.
  const id = `silks${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const parts = [
    { name: 'left-sleeve', geometry: GEOMETRY.left, part: design.sleeves },
    { name: 'right-sleeve', geometry: GEOMETRY.right, part: design.sleeves },
    { name: 'body', geometry: GEOMETRY.body, part: design.body },
    { name: 'cap', geometry: GEOMETRY.cap, part: design.cap },
  ];
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox={GEOMETRY.viewBox}
    width={size} height={size * GEOMETRY.height / GEOMETRY.width} role="img" aria-label="승부복 앞모습">
    {parts.map(({ name, geometry, part }) => {
      const clip = `${id}-${name}`;
      const [bx, by, bw, bh] = geometry.box;
      const boxTransform = `translate(${bx} ${by}) scale(${bw / 100} ${bh / 100})`;
      const isCap = name === 'cap';
      // 모자 챙: 바탕색 위에 'peak' 층 색(마지막 것)을 칠한다.
      const peakColour = isCap ? part.layers.filter((l) => l.pattern === 'peak').at(-1)?.colour ?? part.base : null;
      return <g key={name} data-part={name}>
        {peakColour !== null && <path data-cap-peak d={CAP_PEAK_PATH} fill={peakColour}
          stroke={GEOMETRY.outline} strokeWidth={GEOMETRY.stroke} strokeLinejoin="round" />}
        <defs><clipPath id={clip}><path d={geometry.path} /></clipPath></defs>
        <g clipPath={`url(#${clip})`}>
          <rect data-layer="base" x={bx} y={by} width={bw} height={bh} fill={part.base} />
          {part.layers.map((layer, index) => <g key={index} data-layer={index + 1}
            data-pattern={layer.pattern} fill={layer.colour} color={layer.colour}>
            {layer.pattern === 'border'
              ? <path d={geometry.path} fill="none" stroke={layer.colour} strokeWidth={GEOMETRY.borderStroke} />
              : geometry.axis !== null && (layer.pattern === 'spots' || layer.pattern === 'stars')
                ? sleeveMotifs(layer.pattern, geometry.axis, geometry.poly!)
              : geometry.name === 'body' && layer.pattern in BODY_LAYOUTS
                ? <>{BODY_LAYOUTS[layer.pattern as keyof typeof BODY_LAYOUTS].points.map(([x, y], i) =>
                    layer.pattern === 'stars'
                      ? star(x, y, BODY_LAYOUTS.stars.size / STAR_RADIUS, String(i))
                      : <circle key={i} cx={x} cy={y} r={BODY_LAYOUTS.large_spots.size} />)}</>
              : geometry.name === 'cap' && layer.pattern === 'stars'
                ? <>{CAP_STARS.points.map(([x, y], i) => star(x, y, CAP_STARS.size / STAR_RADIUS, String(i)))}</>
              : geometry.poly !== null && layer.pattern in MOTIFS
                ? motifShapes(layer.pattern as keyof typeof MOTIFS, geometry.poly, geometry.box)
                : geometry.poly !== null && layer.pattern === 'star'
                  ? star(BODY_STAR.x, BODY_STAR.y, BODY_STAR.size / STAR_RADIUS)
                  : <g transform={boxTransform}>{patternShape(layer.pattern)}</g>}
          </g>)}
        </g>
        <path d={geometry.path} fill="none" stroke={GEOMETRY.outline} strokeWidth={GEOMETRY.stroke}
          strokeLinejoin="round" />
      </g>;
    })}
  </svg>;
}
