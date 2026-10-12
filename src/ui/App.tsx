import { useState } from 'react';
import type { JSX } from 'react';
import BreedingScreen from './breeding/BreedingScreen';
import RaceDemo from './RaceDemo';
import SeasonScreen from './season/SeasonScreen';
import StandingsScreen from './standings/StandingsScreen';
import { useGame } from './game/useGame';
import { WeightUnitProvider, useWeightUnit } from './game/WeightUnitContext';
import { WEIGHT_UNITS, isWeightUnit, weightUnitLabelKo } from './game/units';

type TabId = 'season' | 'standings' | 'breeding' | 'race';

const TABS: readonly { id: TabId; label: string }[] = [
  { id: 'season', label: '시즌' },
  { id: 'standings', label: '순위·시상' },
  { id: 'breeding', label: '목장·배합' },
  { id: 'race', label: '레이스 데모' },
];

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

  return (
    <main>
      <h1>Silks &amp; Sires</h1>
      <p>유럽 평지 경마 오너-브리더 시뮬레이션</p>
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
      {tab === 'season' && <SeasonScreen game={game} />}
      {tab === 'standings' && <StandingsScreen game={game} />}
      {tab === 'breeding' && <BreedingScreen game={game} />}
      {tab === 'race' && <RaceDemo />}
    </main>
  );
}
