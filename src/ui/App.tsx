import { useState } from 'react';
import BreedingScreen from './breeding/BreedingScreen';
import RaceDemo from './RaceDemo';
import { useGame } from './game/useGame';

type TabId = 'breeding' | 'race';

const TABS: readonly { id: TabId; label: string }[] = [
  { id: 'breeding', label: '목장·배합' },
  { id: 'race', label: '레이스 데모' },
];

export default function App() {
  const [tab, setTab] = useState<TabId>('breeding');
  // 게임 상태는 App 에서 한 번만 든다. 탭을 바꿔도 게임이 사라지지 않도록.
  const game = useGame();

  return (
    <main>
      <h1>Silks &amp; Sires</h1>
      <p>유럽 평지 경마 오너-브리더 시뮬레이션</p>
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
      {tab === 'breeding' ? <BreedingScreen game={game} /> : <RaceDemo />}
    </main>
  );
}
