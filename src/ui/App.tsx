import { useCallback, useState } from 'react';
import type { GameState, SilksDesign } from '../engine/types';
import { formatDateKo, weeksBetween } from '../engine/time/calendar';
import { yearEndPending } from '../engine/stud/yearEnd';
import { silksDesignOf } from '../engine/people/silks';
import { useGame } from './game/useGame';
import { WeightUnitProvider, useWeightUnit } from './game/WeightUnitContext';
import { WEIGHT_UNITS, isWeightUnit, weightUnitLabelKo } from './game/units';
import { feeKo, economyModeKo, fundsWarningKo } from './game/text';
import { fundsBanner } from './economy/economyView';
import NewGameScreen from './newGame/NewGameScreen';
import HomeScreen from './home/HomeScreen';
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
import SilksEditor from './silks/SilksEditor';
import { SILKS_ERROR_KO } from './silks/silksText';
import RaceDemo from './RaceDemo';

type Screen = 'home' | 'stable' | 'breeding' | 'races' | 'sales' | 'farm' | 'management';
const SCREENS: { id: Screen; label: string }[] = [
  { id: 'home', label: '홈' },
  { id: 'stable', label: '마구간' },
  { id: 'breeding', label: '번식' },
  { id: 'races', label: '경주' },
  { id: 'sales', label: '세일' },
  { id: 'farm', label: '목장' },
  { id: 'management', label: '경영' },
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
  const [newGame, setNewGame] = useState(false);
  const [menu, setMenu] = useState(false);
  const [yearEnd, setYearEnd] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ id: string; tab?: HorseTab } | null>(null);
  const [silks, setSilks] = useState<SilksDesign | null>(null);
  const [saving, setSaving] = useState(false);
  const { unit, setUnit } = useWeightUnit();
  const openHorse = useCallback((id: string, tab?: HorseTab) => setSelected({ id, tab }), []);
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
    setSilks(null);
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
      setNotice(text);
    } catch (e) {
      setNotice(messageOf(e));
    }
  };
  return (
    <HorseNavigation.Provider value={{ state, openHorse }}>
      <div className="app-shell">
        <header className="shell-topbar" aria-label="공통 상단 바">
          <div className="shell-identity">
            <span className="shell-brand">Silks &amp; Sires</span>
            <strong data-testid="game-date">{formatDateKo(state.date)}</strong>
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
                  setNotice(state.settings.autoApproveRacePlans === false ? '승인된 출주 계획이 없습니다. 말 상세에서 제안을 승인하세요.' : '출주 예정 계획이 없습니다. 말 상세에서 계획을 확인하세요.');
                  return;
                }
                if (weeks === 0) {
                  setNotice('이번 주 내 출주가 있습니다. 1주 진행하면 결과를 확인할 수 있습니다.');
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
              className="btn task-badge"
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
              aria-expanded={menu}
              aria-controls="game-menu"
              onClick={() => setMenu((v) => !v)}
            >
              메뉴
            </button>
          </div>
          {banner.warning && (
            <p className={`notice ${locked ? 'notice--error' : ''}`} role={locked ? 'alert' : 'status'}>
              {fundsWarningKo(banner.warning)}
            </p>
          )}
          {pending && <p className="notice">연말 정산이 필요합니다. 홈의 이번 주 할 일에서 제출하세요.</p>}
          {notice && (
            <p className="notice" role="status">
              {notice}
            </p>
          )}
          {menu && (
            <div id="game-menu" className="shell-menu">
              <div className="toolbar">
                <button
                  type="button"
                  className="btn"
                  disabled={saving}
                  onClick={() => {
                    setSaving(true);
                    void game
                      .save()
                      .then(() => setNotice('저장했습니다.'))
                      .catch((e) => setNotice(messageOf(e)))
                      .finally(() => setSaving(false));
                  }}
                >
                  저장
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={saving}
                  onClick={() => {
                    setSaving(true);
                    void game
                      .load()
                      .then((ok) => {
                        if (ok) {
                          resetView();
                          setNotice('저장본을 불러왔습니다.');
                        } else setNotice('불러올 저장본이 없습니다.');
                      })
                      .catch((e) => setNotice(messageOf(e)))
                      .finally(() => setSaving(false));
                  }}
                >
                  불러오기
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={saving}
                  onClick={() => {
                    setNewGame(true);
                    setSelected(null);
                    setMenu(false);
                  }}
                >
                  새 게임
                </button>
              </div>
              <fieldset className="settings">
                <legend>설정</legend>
                <label className="field">
                  부담중량 단위
                  <select
                    value={unit}
                    onChange={(e) => {
                      if (isWeightUnit(e.target.value)) setUnit(e.target.value);
                    }}
                  >
                    {WEIGHT_UNITS.map((u) => (
                      <option key={u} value={u}>
                        {weightUnitLabelKo(u)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={state.settings.autoApproveRacePlans === false}
                    onChange={(e) => game.setAutoApproveRacePlans(!e.target.checked)}
                  />{' '}
                  출주 계획은 승인해야 출주
                </label>
                <p className="hint">
                  끄면(기본) 조교사 제안을 빼지 않는 한 그대로 출주합니다. 켜면 승인한 계획만 출주합니다. ·{' '}
                  {economyModeKo(banner.mode)}
                </p>
                <button
                  type="button"
                  className="btn"
                  onClick={() => owner && setSilks(silksDesignOf(owner.silks, owner.id))}
                >
                  승부복 바꾸기
                </button>
                {silks && (
                  <>
                    <SilksEditor design={silks} onChange={setSilks} />
                    <button
                      type="button"
                      className="btn"
                      disabled={saving}
                      onClick={() => {
                        setSaving(true);
                        void game
                          .setSilks(silks)
                          .then((r) => {
                            if (r.ok) {
                              setSilks(null);
                              setNotice('승부복을 적용했습니다.');
                            } else setNotice(SILKS_ERROR_KO[r.error]);
                          })
                          .catch((e) => setNotice(messageOf(e)))
                          .finally(() => setSaving(false));
                      }}
                    >
                      승부복 적용
                    </button>
                    <button type="button" className="btn" disabled={saving} onClick={() => setSilks(null)}>
                      취소
                    </button>
                  </>
                )}
              </fieldset>
            </div>
          )}
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
                      else {
                        setScreen('races');
                        setRacesTab('results');
                      }
                    }}
                  />
                ))}
              {screen === 'stable' && <StableScreen state={state} />}
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
      </div>
    </HorseNavigation.Provider>
  );
}
