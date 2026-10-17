import { useMemo, useState } from 'react';
import type { JSX } from 'react';
import type { GameState } from '../../engine/types';
import { goingKo } from '../horse/horseDetailView';
import RaceViewer from '../race-viewer/RaceViewer';
import { buildReplay, replayList } from './replayView';
import type { ReplayBundle } from './replayView';
import './replayPanel.css';

interface ReplayPanelProps {
  state: GameState;
  initialKey?: string | null;
}

/** 다시볼 레이스를 고르면 저장된 입력으로 다시 돌려 레이스 띠·자막·한 줄 평·결과판을 보인다. */
export default function ReplayPanel({ state, initialKey = null }: ReplayPanelProps): JSX.Element {
  const list = useMemo(() => replayList(state), [state]);
  const [picked, setPicked] = useState<string | null>(initialKey);
  // '내 말 출주만' 체크. null 은 기본값(켬)을 뜻한다. 내 말 레이스가 하나도 없으면 꺼진 상태로 둔다.
  const [mineSetting, setMineSetting] = useState<boolean | null>(null);
  // 고른 항목이 목록에서 사라졌으면(예: 오래된 항목 정리) 선택이 없는 것으로 본다
  const activeKey = picked !== null && list.some((item) => item.key === picked) ? picked : null;
  const anyPlayer = list.some((item) => item.hasPlayer);
  const mineOnly = anyPlayer && (mineSetting ?? true);
  // 고른 항목은 필터와 무관하게 목록에 남긴다(열린 레이스가 목록에서 사라지지 않게)
  const visible = mineOnly ? list.filter((item) => item.hasPlayer || item.key === activeKey) : list;

  const loaded = useMemo((): { bundle: ReplayBundle | null; error: string | null } => {
    if (activeKey === null) return { bundle: null, error: null };
    try {
      return { bundle: buildReplay(state, activeKey), error: null };
    } catch (e) {
      return { bundle: null, error: e instanceof Error ? e.message : '다시보기를 불러오지 못했습니다.' };
    }
  }, [state, activeKey]);

  if (list.length === 0) {
    return <p className="hint">다시 볼 레이스가 아직 없습니다. 내 말이 출주하거나 그룹 1 이 열리면 여기에 쌓입니다.</p>;
  }

  const bundle = loaded.bundle;
  const replay = bundle?.output.sim.replay ?? null;

  return (
    <div>
      <label className="replay-filter">
        <input
          type="checkbox"
          checked={mineOnly}
          disabled={!anyPlayer}
          onChange={(e) => setMineSetting(e.target.checked)}
        />
        내 말 출주만
      </label>
      <ul className="replay-list">
        {visible.map((item) => (
          <li key={item.key}>
            <button
              type="button"
              className={item.key === activeKey ? 'btn btn--primary' : 'btn'}
              aria-pressed={item.key === activeKey}
              onClick={() => setPicked(item.key)}
            >
              {item.dateLabel} · {item.title} · {item.gradeLabel}
              {item.hasPlayer ? ' · 내 말 출주' : ''}
            </button>
          </li>
        ))}
      </ul>

      {loaded.error !== null && <p role="alert">{loaded.error}</p>}

      {bundle !== null && (
        <div>
          <p>
            {bundle.info.raceName} · 마장 {goingKo(bundle.info.going)} · 출주 {bundle.info.horseNames.length}두
          </p>
          {replay !== null ? (
            <div style={{ overflowX: 'auto' }}>
              <RaceViewer
                key={activeKey ?? ''}
                replay={replay}
                result={bundle.output.sim.result}
                path={bundle.output.path}
                info={bundle.info}
                commentary={bundle.commentary}
                verdicts={bundle.verdicts}
              />
            </div>
          ) : (
            <p>재생 기록이 없습니다.</p>
          )}
        </div>
      )}
    </div>
  );
}
