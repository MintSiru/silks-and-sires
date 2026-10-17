import HorseLink from '../horse/HorseLink';
import { Term } from '../common/Term';
import type { GlossaryId } from '../common/glossary';
import { statusBadgeClass } from '../common/badges';
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
  pedigreeLeafRowPx,
  type PedigreeFact,
} from './pedigreeLayout';
import './pedigree.css';

/** 해설 항목 라벨에 붙는 용어 풀이(니크·근친). 외조부는 풀이가 없다. */
const FACT_TERM: Partial<Record<PedigreeFact['key'], GlossaryId>> = {
  nick: 'nick',
  inbreed: 'inbreeding',
};

/**
 * 혈통표 격자. depth 대까지 그린다(기본 3대, 펼치면 5대).
 * 1~depth 대를 한 격자로 그린다: 대 머리는 격자 위 별도 줄(같은 열 구성), 본체는 말단 행 수만큼의 행 트랙.
 * 말단 칸 한 행은 고정 px 라서 이름 칸·빈 칸 모두 같은 높이이고, 상위 칸은 자손 묶음 높이(행 합)만큼 늘어난다.
 */
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
  const leafPx = pedigreeLeafRowPx(depth);
  const deep = depth > PEDIGREE_BASE_DEPTH;
  const columns = `repeat(${depth}, minmax(120px, 1fr))`;

  return (
    <div className={deep ? 'pedigree-wrap pedigree-wrap--deep' : 'pedigree-wrap'}>
      <div className="pedigree__heads" style={{ gridTemplateColumns: columns }}>
        {generations.map((g) => (
          <div key={`head-${g}`} className="pedigree__head" style={{ gridColumn: String(g) }}>
            {g}대
          </div>
        ))}
      </div>
      <div
        className={deep ? 'pedigree pedigree--deep' : 'pedigree'}
        style={{
          gridTemplateColumns: columns,
          gridTemplateRows: `repeat(${grid.rows}, ${leafPx}px)`,
          ['--leaf-row' as string]: `${leafPx}px`,
        }}
      >
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
                gridRow: `${slot.start + 1} / span ${slot.span}`,
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
      {/* 해설·범례·펼치기 버튼을 한 줄에 둔다(좁은 화면에서만 줄바꿈). 5대 표가 말 상세 창 안에 들어오도록 높이를 아낀다. */}
      <div className="pedigree-view__bar">
        <p className="pedigree-view__commentary">
          {facts.map((fact, index) => {
            const termId = FACT_TERM[fact.key];
            return (
              <span key={fact.key}>
                {index > 0 && <span className="pedigree-view__sep"> · </span>}
                {termId ? <Term id={termId}>{fact.label}</Term> : fact.label}{' '}
                {fact.tone ? (
                  <span className={statusBadgeClass(fact.tone)}>{fact.value}</span>
                ) : (
                  <span className={fact.empty ? 'pedigree-view__fact pedigree-view__fact--empty' : 'pedigree-view__fact'}>
                    {fact.value}
                  </span>
                )}
              </span>
            );
          })}
        </p>
        <p className="pedigree__legend">
          <span className="pedigree__key pedigree__key--sire">부측</span>
          <span className="pedigree__key pedigree__key--dam">모측</span>
          <span className="pedigree__legend-inbred">강조: 중복 조상(근친)</span> · 미상은 —
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
