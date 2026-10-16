import { useContext, useState } from 'react';
import type { GameState } from '../../engine/types';
import HorseLink, { HorseNavigation } from '../horse/HorseLink';
import { stableRows, STABLE_TABS, type StableTab } from './stableView';
export default function StableScreen({ state }: { state: GameState }) {
  const [tab, setTab] = useState<StableTab>('active');
  const [query, setQuery] = useState('');
  const { openHorse } = useContext(HorseNavigation);
  const rows = stableRows(state, tab, query);
  return (
    <section className="panel" aria-label="마구간">
      <h2>마구간</h2>
      <nav className="tabs" aria-label="마구간 구분">
        {STABLE_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab ${tab === t.id ? 'tab--active' : ''}`}
            aria-pressed={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label} ({stableRows(state, t.id).length})
          </button>
        ))}
      </nav>
      <label className="field search-field">
        이름 검색
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="말 이름 검색"
        />
      </label>
      {rows.length === 0 ? (
        <p className="empty-state">해당하는 말이 없습니다.</p>
      ) : (
        <div className="table-scroll">
          <table className="data-table stable-table">
            <thead>
              <tr>
                {['이름', '나이·성별', '상태', '조교사', 'OR', tab === 'active' ? '다음 출주' : '번식 상태 / 계획', '확인'].map((s) => (
                  <th key={s}>{s}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="is-clickable" onClick={() => openHorse(r.id)}>
                  <th scope="row">
                    <HorseLink horseId={r.id} name={r.name} />
                  </th>
                  <td>{r.ageSex}</td>
                  <td>
                    <span className={`status-chip status-chip--${r.tone}`}>{r.status}</span>
                  </td>
                  <td>{r.trainer}</td>
                  <td>{r.rating}</td>
                  <td>{r.next}</td>
                  <td>
                    {r.warnings.length > 0 && (
                      <span
                        className="status-caution"
                        title={r.warnings.join(' · ')}
                        aria-label={r.warnings.join(' · ')}
                      >
                        ⚠ {r.warnings.join(' · ')}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
