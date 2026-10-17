import { useContext, useState } from 'react';
import type { GameState } from '../../engine/types';
import { GradeBadge, StatusBadge } from '../common/Badge';
import { positionLabel, positionTone, statusTone } from '../common/badges';
import { orValueKo } from '../common/glossary';
import { Term } from '../common/Term';
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

/** '확인' 열: 경고 문구를 말줄임 없이 줄바꿈해 보인다. */
function WarnCell({ row }: { row: StableRow }) {
  return (
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
  );
}

/** 컨디션 칩. 육성마 탭은 주의·위험 이유 한 줄을 칩 아래에 그대로 보인다(전체 문구는 title). */
function ConditionCell({ row, tab }: { row: StableRow; tab: StableTab }) {
  const c = row.condition;
  const reason = c.reasons.join(' · ');
  return (
    <td className="stable-col stable-col--condition">
      <span title={c.reasons.length > 0 ? reason : '출주 기준 안입니다.'}>
        <StatusBadge tone={c.tone} label={c.label} />
      </span>
      {tab === 'young' && c.tone !== 'good' && reason !== '' && (
        <span className="stable-cond-reason" title={reason}>
          {reason}
        </span>
      )}
    </td>
  );
}

/** 번식 암말 행: 이름(수준 등급), 나이, 번식 상태, 출산 예정, 교배·계획, 최근 산자, 산자 블랙타입. 현역마용 열은 없다. */
function MareRowCells({ row, showWarn }: { row: StableRow; showWarn: boolean }) {
  const b = row.breeding;
  return (
    <>
      <th scope="row" className="stable-col stable-col--name">
        <HorseLink horseId={row.id} name={row.name} />{' '}
        <span title="수준 등급 · 번식 화면 배합 계획과 같은 기준">
          <GradeBadge grade={row.overall} />
        </span>
      </th>
      <td className="stable-col stable-col--age">{row.ageSex}</td>
      <td className="stable-col stable-col--breed">
        {b !== null && <StatusBadge tone={b.tone} label={b.statusKo} />}
      </td>
      <td className="stable-col stable-col--due">{b?.dueKo ?? '—'}</td>
      <td className="stable-col stable-col--plan">
        <span className="next-race__text" title={b?.planKo ?? '계획 없음'}>
          {b?.planKo ?? '계획 없음'}
        </span>
      </td>
      <td className="stable-col stable-col--foals">
        {row.foals.length === 0 ? (
          <span className="next-race__text">산자 없음</span>
        ) : (
          row.foals.map((f, i) => {
            const line = `${f.name} · ${f.ageKo} · ${f.recordKo}`;
            return (
              <span key={i} className="foal-line" title={line}>
                {line}
              </span>
            );
          })
        )}
      </td>
      <td className="stable-col stable-col--produce">{row.blackType ?? 0}</td>
      {showWarn && <WarnCell row={row} />}
    </>
  );
}

function StableRowCells({ row, tab, showWarn }: { row: StableRow; tab: StableTab; showWarn: boolean }) {
  if (tab === 'mares') return <MareRowCells row={row} showWarn={showWarn} />;
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
      <ConditionCell row={row} tab={tab} />
      <td className="stable-col stable-col--form">
        <FormBand runs={row.form} />
      </td>
      <td className="stable-col stable-col--or">
        {typeof row.rating === 'number' ? orValueKo(row.rating) : row.rating}
      </td>
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
      {showWarn && <WarnCell row={row} />}
    </>
  );
}

interface ColumnDef {
  cls: string;
  label: string;
  term?: 'or';
}

/** 탭별 열. 번식 암말 탭은 현역마용 열(컨디션·최근 5전·OR·조교사)을 뺀다. '확인' 열은 경고가 있을 때만. */
function columnsOf(tab: StableTab, showWarn: boolean): ColumnDef[] {
  const columns: ColumnDef[] =
    tab === 'mares'
      ? [
          { cls: 'stable-col--name', label: '이름·수준' },
          { cls: 'stable-col--age', label: '나이·성별' },
          { cls: 'stable-col--breed', label: '번식 상태' },
          { cls: 'stable-col--due', label: '출산 예정' },
          { cls: 'stable-col--plan', label: '교배 종마 / 계획' },
          { cls: 'stable-col--foals', label: '최근 산자' },
          { cls: 'stable-col--produce', label: '산자 블랙타입' },
        ]
      : [
          { cls: 'stable-col--name', label: '이름' },
          { cls: 'stable-col--age', label: '나이·성별' },
          { cls: 'stable-col--status', label: '상태' },
          { cls: 'stable-col--overall', label: '종합' },
          { cls: 'stable-col--condition', label: '컨디션' },
          { cls: 'stable-col--form', label: '최근 5전' },
          { cls: 'stable-col--or', label: 'OR', term: 'or' },
          { cls: 'stable-col--trainer', label: '조교사' },
          { cls: 'stable-col--next', label: tab === 'active' ? '다음 출주' : '번식 상태 / 계획' },
        ];
  if (showWarn) columns.push({ cls: 'stable-col--warn', label: '확인' });
  return columns;
}

export default function StableScreen({ state, initialTab = 'active' }: { state: GameState; initialTab?: StableTab }) {
  const [tab, setTab] = useState<StableTab>(initialTab);
  const [query, setQuery] = useState('');
  const { openHorse } = useContext(HorseNavigation);
  const rows = stableRows(state, tab, query);
  /* '확인' 열은 이 목록의 어떤 말에도 표시할 내용이 없으면 열째 숨긴다. */
  const showWarn = rows.some((r) => r.warnings.length > 0);
  const columns = columnsOf(tab, showWarn);
  return (
    <section className="panel" aria-label="마구간">
      <h2>마구간</h2>
      <div className="tabs-row stable-tabs-row">
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
          <table className={`data-table stable-table stable-table--${tab}`}>
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.cls} className={c.cls}>
                    {c.term ? <Term id={c.term}>{c.label}</Term> : c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="is-clickable" onClick={() => openHorse(r.id)}>
                  <StableRowCells row={r} tab={tab} showWarn={showWarn} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
