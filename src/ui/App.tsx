import { useState } from 'react';
import type { JSX } from 'react';
import BreedingScreen from './breeding/BreedingScreen';
import EconomyScreen from './economy/EconomyScreen';
import { fundsBanner } from './economy/economyView';
import RaceDemo from './RaceDemo';
import SalesScreen from './sales/SalesScreen';
import SeasonScreen from './season/SeasonScreen';
import StaffScreen from './staff/StaffScreen';
import StandingsScreen from './standings/StandingsScreen';
import { useGame } from './game/useGame';
import { WeightUnitProvider, useWeightUnit } from './game/WeightUnitContext';
import { WEIGHT_UNITS, isWeightUnit, weightUnitLabelKo } from './game/units';
import { feeKo, economyModeKo, fundsWarningKo } from './game/text';
import type { GameState } from '../engine/types';

type TabId = 'season' | 'standings' | 'breeding' | 'economy' | 'sales' | 'staff' | 'race';

const TABS: readonly { id: TabId; label: string }[] = [
  { id: 'season', label: '시즌' },
  { id: 'standings', label: '순위·시상' },
  { id: 'breeding', label: '목장·배합' },
  { id: 'economy', label: '경제' },
  { id: 'sales', label: '세일' },
  { id: 'staff', label: '인맥' },
  { id: 'race', label: '레이스 데모' },
];

/** 모든 탭 위의 자금 배너. 자금·빚(있을 때)·경고 문구(파산은 붉은 줄). */
function FundsBanner({ state }: { state: GameState }): JSX.Element {
  const banner = fundsBanner(state);
  const warning = banner.warning;
  return (
    <section className="panel" aria-label="자금 요약">
      <div className="topbar__info">
        <span>자금 {feeKo(banner.funds)}</span>
        {banner.debt > 0 && <span>빚 {feeKo(banner.debt)}</span>}
        <span>{economyModeKo(banner.mode)}</span>
      </div>
      {warning !== null && (
        <p
          className={warning.kind === 'debt' ? 'hint' : 'notice notice--error'}
          role={warning.kind === 'debt' ? undefined : 'alert'}
        >
          {fundsWarningKo(warning)}
        </p>
      )}
    </section>
  );
}

export default function App() {
  return (
    <WeightUnitProvider>
      <AppContent />
    </WeightUnitProvider>
  );
}

/** 부담중량 표시 단위 선택(상단 탭 줄 오른쪽) */
function WeightUnitSelect(): JSX.Element {
  const { unit, setUnit } = useWeightUnit();
  return (
    <label className="unit-select">
      부담중량 단위{' '}
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
  );
}

function AppContent() {
  const [tab, setTab] = useState<TabId>('breeding');
  // 게임 상태는 App 에서 한 번만 든다. 탭을 바꿔도 게임이 사라지지 않도록.
  const game = useGame();
  /** 레거시 파산이면 시즌·목장 탭의 진행 버튼을 막는다 */
  const bankrupt = game.state?.economy.bankrupt === true;

  return (
    <main>
      <h1>Silks &amp; Sires</h1>
      <p>유럽 평지 경마 오너-브리더 시뮬레이션</p>
      {game.state !== null && <FundsBanner state={game.state} />}
      <div className="tabs-row">
        <nav className="tabs" aria-label="화면 선택">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={t.id === tab ? 'tab tab--active' : 'tab'}
              aria-pressed={t.id === tab}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <WeightUnitSelect />
      </div>
      {tab === 'season' && <SeasonScreen game={game} locked={bankrupt} />}
      {tab === 'standings' && <StandingsScreen game={game} />}
      {tab === 'breeding' && <BreedingScreen game={game} locked={bankrupt} />}
      {tab === 'economy' && <EconomyScreen game={game} />}
      {tab === 'sales' && <SalesScreen game={game} locked={bankrupt} />}
      {tab === 'staff' && <StaffScreen game={game} />}
      {tab === 'race' && <RaceDemo />}
    </main>
  );
}
