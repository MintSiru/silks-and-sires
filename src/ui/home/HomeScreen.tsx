import { useContext } from 'react';
import { displayName } from '../../engine/naming/register';
import type { GameState } from '../../engine/types';
import { GradeBadge, PositionBadge } from '../common/Badge';
import HorseEventText from '../horse/HorseEventText';
import HorseLink, { HorseNavigation } from '../horse/HorseLink';
import { homeView } from './homeView';
import RivalCard from '../legacy/RivalCard';
import './home.css';

export default function HomeScreen({
  state,
  onNavigate,
}: {
  state: GameState;
  onNavigate: (screen: 'yearEnd' | 'sales' | 'results' | 'legacy') => void;
}) {
  const view = homeView(state);
  const { openHorse } = useContext(HorseNavigation);
  const nameOf = (id: string) => (state.horses[id] ? displayName(state, state.horses[id]!) : '—');
  return (
    <>
      <h2>홈</h2>
      <div className="home-grid">
        <section className="panel home-briefing">
          <h3>
            이번 주 브리핑 <span className="badge">{view.tasks.length}</span>
          </h3>
          {view.tasks.length === 0 ? (
            <>
              <p className="hint">다음 진행 때 자동으로 일어날 일</p>
              <ul className="task-list">
                {view.briefing.map((item) => (
                  <li key={item.id} className="home-briefing__item">
                    <span>{item.label}</span>
                    <strong className="home-briefing__count">{item.text}</strong>
                    <span className="hint">{item.detail}</span>
                  </li>
                ))}
              </ul>
            </>
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
          <h3>이번 주·다음 주 내 출주 예정</h3>
          {view.entries.length === 0 ? (
            <p className="empty-state">이번 주·다음 주 출주 계획이나 신청이 없습니다.</p>
          ) : (
            <ul className="task-list">
              {view.entries.map((e) => (
                <li key={e.key}>
                  <HorseLink horseId={e.horseId} name={nameOf(e.horseId)} /> · {e.raceName}
                  <div className="hint">{e.weekLabel} · {e.statusLabel}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="panel">
          <h3>최근 결과 3건</h3>
          {view.resultRows.length === 0 && <p className="empty-state">내 말 결과 없음</p>}
          <ul className="task-list home-results">
            {view.resultRows.map((row) => (
              <li key={row.key} className="home-result">
                <div className="home-result__line">
                  <HorseLink horseId={row.horseId} name={row.horseName} />
                  <span aria-hidden="true">·</span>
                  <PositionBadge position={row.position} fieldSize={row.fieldSize || undefined} />
                  <span aria-hidden="true">·</span>
                  <button type="button" className="link-btn" onClick={() => onNavigate('results')}>
                    {row.raceName}
                  </button>
                  {row.grade !== null && <GradeBadge grade={row.grade} />}
                </div>
                <div className="hint">
                  {row.dateLabel} · 우승 <HorseLink name={row.winnerName} />
                </div>
              </li>
            ))}
          </ul>
          {view.majorResult && (
            <p className="hint home-major">
              주요 <GradeBadge grade="G1" /> · {view.majorResult.dateLabel} · {view.majorResult.raceName} · 우승{' '}
              {view.majorResult.winnerName}
            </p>
          )}
        </section>
        <section className="panel">
          <h3>최근 이벤트 5건</h3>
          {view.events.length === 0 && (
            <p className="empty-state">부상·출산·세일 같은 주요 사건이 여기에 남습니다.</p>
          )}
          <ol className="event-list">
            {view.events.map((e, i) => (
              <li key={i}>
                <HorseEventText event={e} />
              </li>
            ))}
          </ol>
        </section>
      </div>
      <RivalCard state={state} onOpen={() => onNavigate('legacy')} />
    </>
  );
}
