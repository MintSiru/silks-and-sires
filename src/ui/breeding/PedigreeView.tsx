import { useMemo } from 'react';
import type { JSX } from 'react';
import { dominantCrosses, findInbreeding } from '../../engine/breeding/inbreeding';
import { DEFAULT_PEDIGREE_DEPTH } from '../../engine/breeding/pedigree';
import type { HorseId, PedigreeNode } from '../../engine/types';

/** 표시 대수(부·모 = 1대). 엔진 기본 깊이와 같다. */
const DEPTH = DEFAULT_PEDIGREE_DEPTH;
/** 세로 칸 수: 1대 한 칸이 절반씩(부측·모측) 차지하므로 2^DEPTH 행 */
const ROWS = 2 ** DEPTH;
const HALF_ROWS = ROWS / 2;
/** 한 행 높이(px). CSS 와 맞춘다 */
const ROW_HEIGHT_PX = 18;

/** 표의 한 칸: 대(1~DEPTH), 시작 행(0-base), 행 수, 노드(미상이면 null) */
interface Slot {
  generation: number;
  start: number;
  span: number;
  node: PedigreeNode | null;
}

/**
 * 부측(위)·모측(아래) 칸 배치. 대가 한 단계 깊어질 때마다 칸 높이는 절반이 된다.
 * 미상 노드도 칸을 차지하므로 노드가 null 이면 자식도 null 로 내려보낸다.
 */
function layout(
  node: PedigreeNode | null,
  generation: number,
  start: number,
  span: number,
  out: Slot[],
): void {
  out.push({ generation, start, span, node });
  if (generation >= DEPTH) return;
  const half = span / 2;
  layout(node?.sire ?? null, generation + 1, start, half, out);
  layout(node?.dam ?? null, generation + 1, start + half, half, out);
}

interface PedigreeViewProps {
  /** 가상 교배 혈통표 루트(horseId null, 대 0). 부는 root.sire, 모는 root.dam */
  root: PedigreeNode;
  /** 말 id → 표시 이름 */
  nameOf: (id: HorseId) => string;
}

export default function PedigreeView({ root, nameOf }: PedigreeViewProps): JSX.Element {
  const slots = useMemo(() => {
    const out: Slot[] = [];
    layout(root.sire, 1, 0, HALF_ROWS, out);
    layout(root.dam, 1, HALF_ROWS, HALF_ROWS, out);
    return out;
  }, [root]);

  // 강조 대상: 지배 교차 조상만 (preview 의 inbreeding 과 같은 기준)
  const inbredIds = useMemo(
    () => new Set(dominantCrosses(root, findInbreeding(root)).map((c) => c.ancestorId)),
    [root],
  );

  const generations = Array.from({ length: DEPTH }, (_, i) => i + 1);

  return (
    <div className="pedigree-wrap">
      <p className="pedigree__legend">
        위: 부측 · 아래: 모측 · <span className="pedigree__legend-inbred">강조: 인브리드 대상 조상</span> · 미상은 —
      </p>
      <div
        className="pedigree"
        style={{ gridTemplateRows: `auto repeat(${ROWS}, ${ROW_HEIGHT_PX}px)` }}
      >
        {generations.map((g) => (
          <div key={`head-${g}`} className="pedigree__head" style={{ gridColumn: String(g), gridRow: '1' }}>
            {g}대
          </div>
        ))}
        {slots.map((slot) => {
          const id = slot.node?.horseId ?? null;
          const inbred = id !== null && inbredIds.has(id);
          const classes = [
            'pedigree__cell',
            slot.start < HALF_ROWS ? 'pedigree__cell--sire' : 'pedigree__cell--dam',
            id === null ? 'pedigree__cell--unknown' : '',
            inbred ? 'pedigree__cell--inbred' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <div
              key={`${slot.generation}-${slot.start}`}
              className={classes}
              style={{
                gridColumn: String(slot.generation),
                gridRow: `${slot.start + 2} / span ${slot.span}`,
              }}
            >
              {id === null ? '—' : nameOf(id)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
