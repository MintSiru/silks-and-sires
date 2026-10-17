import { useContext, useState } from 'react';
import type { GameState } from '../../engine/types';
import { GradeBadge, StatusBadge } from '../common/Badge';
import { positionLabel, positionTone, statusTone } from '../common/badges';
import HorseLink, { HorseNavigation } from '../horse/HorseLink';
import type { RunForm } from '../horse/horseDetailView';
import {
  stableCount,
  stableRows,
  STABLE_TABS,
  type NextRaceView,
  type StableRow,
  type StableTab,
} from './stableView';
import './stable.css';

const COLUMN_CLASSES = [
  'stable-col--name',
  'stable-col--age',
  'stable-col--status',
  'stable-col--overall',
  'stable-col--condition',
  'stable-col--form',
  'stable-col--or',
  'stable-col--trainer',
  'stable-col--next',
  'stable-col--warn',
] as const;

/** 최근 착순 띠. 1~3착은 색으로 강조하고, 착순 숫자를 그대로 적는다. */
function FormBand({ runs }: { runs: readonly RunForm[] }) {
  if (runs.length === 0) return <span className="hint">—</span>;
  const title = runs.map((r) => positionLabel(r.position, r.fieldSize)).join(' · ');
  return (
    <span className="form-band" title={`최근 착순: ${title}`}>
      {runs.map((r, i) => (
        <span key={i} className={`form-band__item form-band__item--${positionTone(r.position)}`}>
          {r.position}
        </span>
      ))}
    </span>
  );
}

/** 다음 출주 두 줄: 1줄 날짜·등급·거리, 2줄 레이스명(잘림은 말줄임). 전체 문구는 title. */
function NextRace({ race, full }: { race: NextRaceView; full: string }) {
  return (
    <span className="next-race" title={full}>
      <span className="next-race__line1">
        {race.dateLabel}
        {race.gradeText !== null && (
          <>
            {' '}
            <GradeBadge grade={race.gradeText} />
          </>
        )}
        {race.distanceText !== null && <> · {race.distanceText}</>}
      </span>
      <span className="next-race__line2">
        {race.title}
        {race.away}
      </span>
    </span>
  );
}

function StableRowCells({ row, tab }: { row: StableRow; tab: StableTab }) {
  const c = row.condition;
  return (
    <>
      <th scope="row" className="stable-col stable-col--name">
        <HorseLink horseId={row.id} name={row.name} />
      </th>
      <td className="stable-col stable-col--age">{row.ageSex}</td>
      <td className="stable-col stable-col--status">
        <StatusBadge tone={statusTone(row.tone)} label={row.status} />
      </td>
      <td className="stable-col stable-col--overall">
        <GradeBadge grade={row.overall} />
      </td>
      <td className="stable-col stable-col--condition">
        <span title={c.reasons.length > 0 ? c.reasons.join(' · ') : '출주 기준 안입니다.'}>
          <StatusBadge tone={c.tone} label={c.label} />
        </span>
      </td>
      <td className="stable-col stable-col--form">
        <FormBand runs={row.form} />
      </td>
      <td className="stable-col stable-col--or">{row.rating}</td>
      <td className="stable-col stable-col--trainer">
        <span className="stable-trainer">{row.trainer}</span>
      </td>
      <td className="stable-col stable-col--next">
        {tab === 'active' && row.nextRace !== null ? (
          <NextRace race={row.nextRace} full={row.next} />
        ) : (
          <span className="next-race__text">{row.next}</span>
        )}
      </td>
      <td className="stable-col stable-col--warn">
        {row.warnings.length > 0 && (
          <span
            className="status-caution"
            title={row.warnings.join(' · ')}
            aria-label={row.warnings.join(' · ')}
          >
            ⚠ {row.warnings.join(' · ')}
          </span>
        )}
      </td>
    </>
  );
}

export default function StableScreen({ state }: { state: GameState }) {
  const [tab, setTab] = useState<StableTab>('active');
  const [query, setQuery] = useState('');
  const { openHorse } = useContext(HorseNavigation);
  const rows = stableRows(state, tab, query);
  const headers = [
    '이름',
    '나이·성별',
    '상태',
    '종합',
    '컨디션',
    '최근 5전',
    'OR',
    '조교사',
    tab === 'active' ? '다음 출주' : '번식 상태 / 계획',
    '확인',
  ];
  return (
    <section className="panel" aria-label="마구간">
      <h2>마구간</h2>
      <div className="tabs-row">
        <nav className="tabs" aria-label="마구간 구분">
          {STABLE_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`tab ${tab === t.id ? 'tab--active' : ''}`}
              aria-pressed={tab === t.id}
              onClick={() => setTab(t.id)}
            >
              {t.label} ({stableCount(state, t.id)})
            </button>
          ))}
        </nav>
        <input
          type="search"
          className="stable-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="말 이름 검색"
          aria-label="말 이름 검색"
        />
      </div>
      {rows.length === 0 ? (
        <p className="empty-state">해당하는 말이 없습니다.</p>
      ) : (
        <div className="table-scroll stable-scroll">
          <table className="data-table stable-table">
            <thead>
              <tr>
                {headers.map((s, i) => (
                  <th key={s} className={COLUMN_CLASSES[i]}>
                    {s}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="is-clickable" onClick={() => openHorse(r.id)}>
                  <StableRowCells row={r} tab={tab} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
