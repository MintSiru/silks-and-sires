import { useContext } from 'react';
import { displayName } from '../../engine/naming/register';
import type { GameState } from '../../engine/types';
import HorseEventText from '../horse/HorseEventText';
import HorseLink, { HorseNavigation } from '../horse/HorseLink';
import { homeView } from './homeView';
export default function HomeScreen({
  state,
  onNavigate,
}: {
  state: GameState;
  onNavigate: (screen: 'yearEnd' | 'sales' | 'results') => void;
}) {
  const view = homeView(state);
  const { openHorse } = useContext(HorseNavigation);
  const nameOf = (id: string) => (state.horses[id] ? displayName(state, state.horses[id]!) : '—');
  return (
    <>
      <h2>홈</h2>
      <div className="home-grid">
        <section className="panel">
          <h3>
            이번 주 할 일 <span className="badge">{view.tasks.length}</span>
          </h3>
          {view.tasks.length === 0 ? (
            <p className="empty-state">검토할 일이 없습니다. 다음 주로 진행해 보세요.</p>
          ) : (
            <ul className="task-list">
              {view.tasks.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    className="task-link"
                    onClick={() =>
                      t.screen === 'horse' && t.horseId
                        ? openHorse(t.horseId, t.horseTab)
                        : t.screen !== 'horse' && onNavigate(t.screen)
                    }
                  >
                    {t.label}
                    <span aria-hidden="true"> →</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="panel">
          <h3>이번 주 내 출주</h3>
          {view.entries.length === 0 ? (
            <p className="empty-state">이번 주 접수된 출주가 없습니다.</p>
          ) : (
            <ul className="task-list">
              {view.entries.map((e) => (
                <li key={e.key}>
                  <HorseLink horseId={e.horseId} name={nameOf(e.horseId)} /> · {e.raceName}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="panel">
          <h3>최근 결과 3건</h3>
          {view.results.length === 0 && <p className="empty-state">아직 결과가 없습니다.</p>}
          <ul className="task-list">
            {view.results.map((r) => (
              <li key={r.key}>
                <button type="button" className="link-btn" onClick={() => onNavigate('results')}>
                  {r.dateLabel} · {r.raceName}
                </button>
                <div>
                  우승 <HorseLink name={r.winnerName} />
                </div>
                <div>
                  {r.playerRuns.map((p) => (
                    <span key={p.horseId}>
                      <HorseLink horseId={p.horseId} name={p.name} /> {p.position}착{' '}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
        <section className="panel">
          <h3>최근 이벤트 5건</h3>
          {view.events.length === 0 && <p className="empty-state">아직 기록이 없습니다.</p>}
          <ol className="event-list">
            {view.events.map((e, i) => (
              <li key={i}>
                <HorseEventText event={e} />
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  );
}
