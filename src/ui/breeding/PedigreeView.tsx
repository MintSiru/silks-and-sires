import HorseLink from '../horse/HorseLink';
import { useMemo, useState } from 'react';
import type { JSX } from 'react';
import { dominantCrosses, findInbreeding } from '../../engine/breeding/inbreeding';
import { DEFAULT_PEDIGREE_DEPTH } from '../../engine/breeding/pedigree';
import type { HorseId, PedigreeNode } from '../../engine/types';
import {
  PEDIGREE_BASE_DEPTH,
  isBlankPedigreeNode,
  layoutPedigree,
  pedigreeCommentary,
} from './pedigreeLayout';
import './pedigree.css';

/** 한 행 높이(px). 말단(가장 깊은 대) 칸 한 칸의 높이이며 최소 28px 다(M6-V V5). pedigree.css 의 칸 최소 높이와 맞춘다. */
const ROW_HEIGHT_PX = 28;

/** 혈통표 격자. depth 대까지 그린다(기본 3대, 펼치면 5대). */
export function PedigreeTable({
  root,
  nameOf,
  depth,
}: {
  root: PedigreeNode;
  nameOf: (id: HorseId) => string;
  depth: number;
}): JSX.Element {
  const grid = useMemo(() => layoutPedigree(root, depth), [root, depth]);

  // 강조 대상: 지배 교차 조상만 (preview 의 inbreeding 과 같은 기준)
  const inbredIds = useMemo(
    () => new Set(dominantCrosses(root, findInbreeding(root)).map((c) => c.ancestorId)),
    [root],
  );

  const generations = Array.from({ length: depth }, (_, i) => i + 1);

  return (
    <div className="pedigree-wrap">
      <div
        className="pedigree"
        style={{
          gridTemplateColumns: `repeat(${depth}, minmax(120px, 1fr))`,
          gridTemplateRows: `auto repeat(${grid.rows}, ${ROW_HEIGHT_PX}px)`,
        }}
      >
        {generations.map((g) => (
          <div key={`head-${g}`} className="pedigree__head" style={{ gridColumn: String(g), gridRow: '1' }}>
            {g}대
          </div>
        ))}
        {grid.slots.map((slot) => {
          const id = slot.node?.horseId ?? null;
          // 이름 미기록 암말(실명 종마의 모마 칸)은 빈칸과 같은 모양으로 보인다(원칙 1)
          const blank = isBlankPedigreeNode(slot.node);
          const inbred = id !== null && inbredIds.has(id);
          const classes = [
            'pedigree__cell',
            slot.side === 'sire' ? 'pedigree__cell--sire' : 'pedigree__cell--dam',
            blank ? 'pedigree__cell--unknown' : '',
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
              {/* 빈 칸은 '—' 한 줄만 두고 보조 줄을 만들지 않는다 */}
              {blank || id === null ? '—' : <HorseLink horseId={id} name={nameOf(id)} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface PedigreeViewProps {
  /** 가상 교배 혈통표 루트(horseId null, 대 0). 부는 root.sire, 모는 root.dam */
  root: PedigreeNode;
  /** 말 id → 표시 이름 */
  nameOf: (id: HorseId) => string;
  /**
   * 니크 라벨(호출하는 쪽이 계산). 넘기지 않으면 상단 해설에서 니크 항목을 뺀다.
   * 미확인이면 null 을 넘긴다('정보 없음'으로 보인다).
   */
  nick?: string | null;
}

export default function PedigreeView({ root, nameOf, nick }: PedigreeViewProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const depth = expanded ? DEFAULT_PEDIGREE_DEPTH : PEDIGREE_BASE_DEPTH;
  const facts = pedigreeCommentary(root, nameOf, nick);
  return (
    <div className="pedigree-view">
      <p className="pedigree-view__commentary">
        {facts.map((fact, index) => (
          <span key={fact.key}>
            {index > 0 && <span className="pedigree-view__sep"> · </span>}
            {fact.label}{' '}
            <span className={fact.empty ? 'pedigree-view__fact pedigree-view__fact--empty' : 'pedigree-view__fact'}>
              {fact.value}
            </span>
          </span>
        ))}
      </p>
      <div className="pedigree-view__bar">
        <p className="pedigree__legend">
          <span className="pedigree__key pedigree__key--sire">부측</span>
          <span className="pedigree__key pedigree__key--dam">모측</span>
          <span className="pedigree__legend-inbred">강조: 인브리드 대상 조상</span> · 미상은 —
        </p>
        <button
          type="button"
          className="btn pedigree-view__toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? `${PEDIGREE_BASE_DEPTH}대만 보기` : `${DEFAULT_PEDIGREE_DEPTH}대 보기`}
        </button>
      </div>
      <PedigreeTable root={root} nameOf={nameOf} depth={depth} />
    </div>
  );
}
