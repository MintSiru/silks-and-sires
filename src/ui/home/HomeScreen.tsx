import { useContext } from 'react';
import { displayName } from '../../engine/naming/register';
import type { GameState, TutorialProgress } from '../../engine/types';
import { GradeBadge, PositionBadge } from '../common/Badge';
import HorseEventText from '../horse/HorseEventText';
import HorseLink, { HorseNavigation } from '../horse/HorseLink';
import { homeView } from './homeView';
import RivalCard from '../legacy/RivalCard';
import TutorialCard from '../tutorial/TutorialCard';
import { showTutorial } from '../tutorial/tutorialView';
import './home.css';

export default function HomeScreen({
  state,
  onNavigate,
  onTutorial,
}: {
  state: GameState;
  onNavigate: (screen: 'yearEnd' | 'sales' | 'results' | 'legacy' | 'stable' | 'breeding') => void;
  /** 첫 시즌 체크리스트 진행 저장(useGame.setTutorial). 없으면 카드 진행은 저장되지 않는다 */
  onTutorial?: (progress: TutorialProgress) => void;
}) {
  const view = homeView(state);
  const { openHorse } = useContext(HorseNavigation);
  const nameOf = (id: string) => (state.horses[id] ? displayName(state, state.horses[id]!) : '—');
  return (
    <>
      <h2>홈</h2>
      {showTutorial(state) && <TutorialCard state={state} onNavigate={onNavigate} onTutorial={onTutorial} />}
      <div className="home-grid">
        <section className="panel home-briefing">
          {/* 결정 대기 수는 상단 '이번 주 할 일' 배지에만 보인다(V1 항목 1) */}
          <h3>이번 주 브리핑</h3>
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
                  <div className="hint home-entry__meta">
                    {e.weekLabel}
                    {e.gradeText !== null && (
                      <>
                        {' '}
                        <GradeBadge grade={e.gradeText} />
                      </>
                    )}
                    {e.distanceText !== null && <> · {e.distanceText}</>} · {e.statusLabel}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="panel home-results-card">
          <h3>내 말 최근 결과</h3>
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
              <span className="home-major__label">세계 주요 결과</span>
              <GradeBadge grade="G1" /> · {view.majorResult.dateLabel} · {view.majorResult.raceName} · 우승{' '}
              {view.majorResult.winnerName}
            </p>
          )}
        </section>
        <section className="panel">
          <h3>주요 사건</h3>
          <p className="hint">최근 5건까지</p>
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
