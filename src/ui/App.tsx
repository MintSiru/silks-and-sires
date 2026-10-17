import { useCallback, useRef, useState } from 'react';
import type { GameState } from '../engine/types';
import { formatDateKo, weeksBetween } from '../engine/time/calendar';
import { yearEndPending } from '../engine/stud/yearEnd';
import { silksDesignOf } from '../engine/people/silks';
import { useGame } from './game/useGame';
import { WeightUnitProvider } from './game/WeightUnitContext';
import { feeKo, economyModeKo, fundsWarningKo } from './game/text';
import { fundsBanner } from './economy/economyView';
import NewGameScreen from './newGame/NewGameScreen';
import HomeScreen from './home/HomeScreen';
import LegacyScreen from './legacy/LegacyScreen';
import AwardsCeremony from './legacy/AwardsCeremony';
import { homeTasks } from './home/homeView';
import StableScreen from './stable/StableScreen';
import HorseDetail from './horse/HorseDetail';
import { HorseNavigation, type HorseTab } from './horse/HorseLink';
import BreedingScreen from './breeding/BreedingScreen';
import SeasonScreen from './season/SeasonScreen';
import StandingsScreen from './standings/StandingsScreen';
import SalesScreen from './sales/SalesScreen';
import FarmScreen from './farm/FarmScreen';
import EconomyScreen from './economy/EconomyScreen';
import StaffScreen from './staff/StaffScreen';
import YearEndScreen from './yearEnd/YearEndScreen';
import SilksSvg from './silks/SilksSvg';
import RaceDemo from './RaceDemo';
import './shell/shell.css';
import SettingsModal from './shell/SettingsModal';
import { Toast, type ToastNotice } from './shell/Toast';
import { seasonLabel } from './shell/seasonBadge';

type Screen = 'home' | 'stable' | 'breeding' | 'races' | 'sales' | 'farm' | 'management' | 'legacy';
const SCREENS: { id: Screen; label: string }[] = [
  { id: 'home', label: '홈' },
  { id: 'stable', label: '마구간' },
  { id: 'breeding', label: '번식' },
  { id: 'races', label: '경주' },
  { id: 'sales', label: '세일' },
  { id: 'farm', label: '목장' },
  { id: 'management', label: '경영' },
  { id: 'legacy', label: '기록' },
];
function messageOf(error: unknown) {
  return error instanceof Error ? error.message : '작업을 완료하지 못했습니다.';
}
/** 진행 방식에 따라 출주 예정 계획과 실제 접수를 함께 본다. */
export function nextPlayerRaceInWeeks(state: GameState): number | null {
  const dates = Object.values(state.seasonState.racePlans ?? {}).flatMap((plans) =>
    plans.filter((p) => p.status === 'approved' || p.status === 'declared' ||
      (p.status === 'proposed' && state.settings.autoApproveRacePlans !== false)).map((p) => p.date),
  );
  dates.push(
    ...state.seasonState.meetings
      .filter((m) =>
        m.races.some(
          (r) => r.status !== 'run' && r.status !== 'abandoned' && r.declarations.some((d) => d.isPlayer),
        ),
      )
      .map((m) => m.date),
  );
  const distances = dates.map((d) => weeksBetween(state.date, d)).filter((n) => n >= 0);
  return distances.length ? Math.min(...distances) : null;
}
export default function App() {
  return (
    <WeightUnitProvider>
      <AppContent />
    </WeightUnitProvider>
  );
}
function AppContent() {
  const game = useGame();
  const [screen, setScreen] = useState<Screen>('home');
  const [racesTab, setRacesTab] = useState<'calendar' | 'results' | 'standings'>('calendar');
  const [managementTab, setManagementTab] = useState<'funds' | 'staff'>('funds');
  const [legacyTab, setLegacyTab] = useState<'chronicle' | 'rivals'>('chronicle');
  const [newGame, setNewGame] = useState(false);
  const [menu, setMenu] = useState(false);
  const [yearEnd, setYearEnd] = useState(false);
  /** 토스트 알림. id 가 바뀔 때마다 4초를 다시 잰다. */
  const [notice, setNotice] = useState<ToastNotice | null>(null);
  const noticeSeq = useRef(0);
  const [selected, setSelected] = useState<{ id: string; tab?: HorseTab } | null>(null);
  const openHorse = useCallback((id: string, tab?: HorseTab) => setSelected({ id, tab }), []);
  const notify = useCallback((text: string, tone: ToastNotice['tone'] = 'ok') => {
    noticeSeq.current += 1;
    setNotice({ id: noticeSeq.current, text, tone });
  }, []);
  const dismissNotice = useCallback(() => setNotice(null), []);
  const state = game.state;
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('demo'))
    return (
      <main>
        <RaceDemo />
      </main>
    );
  const resetView = () => {
    setScreen('home');
    setSelected(null);
    setYearEnd(false);
    setMenu(false);
    setNewGame(false);
    setNotice(null);
  };
  if (state === null)
    return (
      <main className="start-screen">
        <h1>Silks &amp; Sires</h1>
        <p className="hint">유럽 평지 경마 오너-브리더 시뮬레이션</p>
        <NewGameScreen game={game} onDone={resetView} />
      </main>
    );
  const owner = state.owners[state.playerOwnerId];
  const banner = fundsBanner(state);
  const tasks = homeTasks(state);
  const pending = yearEndPending(state);
  const locked = state.economy.bankrupt;
  const run = (action: () => void, text: string) => {
    try {
      action();
      notify(text);
    } catch (e) {
      notify(messageOf(e), 'error');
    }
  };
  return (
    <HorseNavigation.Provider value={{ state, openHorse }}>
      <div className="app-shell">
        <header className="shell-topbar" aria-label="공통 상단 바">
          <div className="shell-identity">
            <span className="shell-brand">Silks &amp; Sires</span>
            <strong data-testid="game-date">{formatDateKo(state.date)}</strong>
            {seasonLabel(state.date).map((label) => (
              <span key={label} className="badge badge--muted shell-season">
                {label}
              </span>
            ))}
            {owner && <SilksSvg design={silksDesignOf(owner.silks, owner.id)} size={36} />}
            <span>마주 {owner?.name ?? '—'}</span>
            <strong
              className={
                banner.warning
                  ? banner.warning.kind === 'debt'
                    ? 'status-caution'
                    : 'status-danger'
                  : 'status-good'
              }
            >
              자금 {feeKo(banner.funds)}
            </strong>
            {banner.debt > 0 && <span className="status-caution">빚 {feeKo(banner.debt)}</span>}
          </div>
          <div className="shell-actions">
            <button
              type="button"
              className={pending || newGame ? 'btn' : 'btn btn--primary'}
              disabled={locked || pending || newGame}
              onClick={() => run(() => game.advance(1), '1주 진행했습니다.')}
            >
              1주 진행
            </button>
            <button
              type="button"
              className="btn"
              disabled={locked || pending || newGame}
              onClick={() => {
                const weeks = nextPlayerRaceInWeeks(state);
                if (weeks === null) {
                  notify(state.settings.autoApproveRacePlans === false ? '승인된 출주 계획이 없습니다. 말 상세에서 제안을 승인하세요.' : '출주 예정 계획이 없습니다. 말 상세에서 계획을 확인하세요.');
                  return;
                }
                if (weeks === 0) {
                  notify('이번 주 내 출주가 있습니다. 1주 진행하면 결과를 확인할 수 있습니다.');
                  return;
                }
                run(
                  () => game.advance(weeks),
                  '다음 내 출주 예정 주까지 진행했습니다. 홈에서 출주와 알림을 확인하세요.',
                );
              }}
            >
              다음 내 출주까지
            </button>
            <button
              type="button"
              className="btn"
              disabled={locked || pending || newGame}
              onClick={() => run(() => game.advance(4), '4주 진행했습니다.')}
            >
              4주 진행
            </button>
            <button
              type="button"
              className={`badge shell-task-badge ${tasks.length > 0 ? 'badge--warn' : 'badge--muted'}`}
              onClick={() => {
                setScreen('home');
                setYearEnd(false);
                setNewGame(false);
                setMenu(false);
              }}
            >
              이번 주 할 일 {tasks.length}
            </button>
            <button
              type="button"
              className="btn"
              aria-haspopup="dialog"
              aria-expanded={menu}
              onClick={() => setMenu(true)}
            >
              메뉴
            </button>
          </div>
          {banner.warning && (
            <p className={`notice ${locked ? 'notice--error' : ''}`} role={locked ? 'alert' : 'status'}>
              {fundsWarningKo(banner.warning)}
            </p>
          )}
          {pending && <p className="notice">연말 정산이 필요합니다. 홈의 이번 주 브리핑에서 제출하세요.</p>}
        </header>
        <nav className="shell-nav" aria-label="화면 선택">
          {SCREENS.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-current={screen === s.id ? 'page' : undefined}
              className={screen === s.id ? 'shell-nav__item is-active' : 'shell-nav__item'}
              onClick={() => {
                setScreen(s.id);
                if (s.id === 'legacy') setLegacyTab('chronicle');
                setNewGame(false);
                setYearEnd(false);
                setMenu(false);
              }}
            >
              {s.label}
            </button>
          ))}
        </nav>
        <main className="shell-main">
          {newGame ? (
            <NewGameScreen
              game={game}
              onDone={resetView}
              onCancel={() => setNewGame(false)}
              canLoad={false}
            />
          ) : (
            <>
              {screen === 'home' &&
                (yearEnd && pending ? (
                  <YearEndScreen game={game} />
                ) : (
                  <HomeScreen
                    state={state}
                    onNavigate={(target) => {
                      if (target === 'yearEnd') setYearEnd(true);
                      else if (target === 'sales') setScreen('sales');
                      else if (target === 'legacy') {
                        setLegacyTab('rivals');
                        setScreen('legacy');
                      }
                      else {
                        setScreen('races');
                        setRacesTab('results');
                      }
                    }}
                  />
                ))}
              {screen === 'stable' && <StableScreen state={state} />}
              {screen === 'legacy' && <LegacyScreen key={legacyTab} state={state} initialTab={legacyTab} />}
              {screen === 'breeding' && <BreedingScreen game={game} locked={locked} />}
              {screen === 'races' && (
                <>
                  <h2>경주</h2>
                  <nav className="tabs" aria-label="경주 구분">
                    {(
                      [
                        ['calendar', '캘린더'],
                        ['results', '결과'],
                        ['standings', '순위·시상'],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        type="button"
                        key={id}
                        className={`tab ${racesTab === id ? 'tab--active' : ''}`}
                        aria-pressed={racesTab === id}
                        onClick={() => setRacesTab(id)}
                      >
                        {label}
                      </button>
                    ))}
                  </nav>
                  {racesTab === 'standings' ? (
                    <StandingsScreen game={game} />
                  ) : (
                    <SeasonScreen key={racesTab} game={game} locked={locked} section={racesTab} />
                  )}
                </>
              )}
              {screen === 'sales' && <SalesScreen game={game} locked={locked} />}
              {screen === 'farm' && <FarmScreen game={game} locked={locked} />}
              {screen === 'management' && (
                <>
                  <h2>경영</h2>
                  <nav className="tabs" aria-label="경영 구분">
                    {(
                      [
                        ['funds', '자금'],
                        ['staff', '인맥'],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        className={`tab ${managementTab === id ? 'tab--active' : ''}`}
                        aria-pressed={managementTab === id}
                        onClick={() => setManagementTab(id)}
                      >
                        {label}
                      </button>
                    ))}
                  </nav>
                  {managementTab === 'funds' ? <EconomyScreen game={game} /> : <StaffScreen game={game} />}
                </>
              )}
            </>
          )}
        </main>
        <AwardsCeremony state={state} events={game.lastEvents} />
        {selected && state.horses[selected.id] && (
          <HorseDetail
            key={`${selected.id}:${selected.tab ?? 'overview'}`}
            game={game}
            horseId={selected.id}
            initialTab={selected.tab}
            onClose={() => setSelected(null)}
            onBreeding={() => {
              setSelected(null);
              setScreen('breeding');
            }}
          />
        )}
        {menu && (
          <SettingsModal
            game={game}
            state={state}
            economyText={economyModeKo(banner.mode)}
            onClose={() => setMenu(false)}
            onNotify={notify}
            onLoaded={() => {
              resetView();
              notify('저장본을 불러왔습니다.');
            }}
            onStartNewGame={() => {
              setNewGame(true);
              setSelected(null);
              setMenu(false);
            }}
          />
        )}
        <Toast notice={notice} onExpire={dismissNotice} />
      </div>
    </HorseNavigation.Provider>
  );
}
