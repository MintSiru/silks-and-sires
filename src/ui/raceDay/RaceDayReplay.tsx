import { useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import type { GameState, RaceDayBrief } from '../../engine/types';
import RaceViewer from '../race-viewer/RaceViewer';
import { buildReplay, replayKey } from '../season/replayView';
import type { ReplayBundle } from '../season/replayView';
import { findReplayEntry } from './raceDayView';

/**
 * 재생 캔버스 폭. 대화상자 안쪽 폭(1200 - 좌우 여백·테두리)에 맞춰 우측 순위 칸이 잘리지 않게 한다(M7-RD2b).
 * 화면 표시 크기일 뿐이라 밸런스 상수가 아니다.
 */
const REPLAY_WIDTH = 1160;

interface ReplayLoad {
  bundle: ReplayBundle | null;
  message: string | null;
}

export interface RaceDayReplayProps {
  state: GameState;
  brief: RaceDayBrief;
  /** 재생이 끝났거나(한 줄 평까지) 건너뛰었을 때 한 번 부른다 */
  onFinished: () => void;
}

/** 이 레이스의 저장된 입력으로 재생 묶음을 만든다. 재생 기록이 없으면 bundle 은 null. */
function loadReplay(state: GameState, brief: RaceDayBrief): ReplayLoad {
  const entry = findReplayEntry(state, brief.card.meetingId, brief.raceId);
  if (entry === undefined) return { bundle: null, message: null };
  try {
    return { bundle: buildReplay(state, replayKey(entry)), message: null };
  } catch (error) {
    return { bundle: null, message: error instanceof Error ? error.message : '다시보기를 불러오지 못했습니다.' };
  }
}

/**
 * 출주 후 자동 재생(M7-RD). RaceViewer 의 재생이 끝나면 onFinished 를 부른다(RaceViewer 의 onFinished prop).
 * '결과로 건너뛰기'는 RaceViewer 의 skipToResult 카운터를 올린다.
 */
export default function RaceDayReplay({ state, brief, onFinished }: RaceDayReplayProps): JSX.Element | null {
  const load = useMemo(() => loadReplay(state, brief), [state, brief]);
  const [skipSignal, setSkipSignal] = useState(0);
  const bundle = load.bundle;
  const hasBundle = bundle !== null;

  // 재생 기록이 없거나 불러오지 못하면 바로 결과로 넘긴다.
  useEffect(() => {
    if (!hasBundle) onFinished();
  }, [hasBundle, onFinished]);

  if (bundle === null) return null;

  return (
    <section className="rd-replay" aria-label="레이스 재생">
      <header className="rd-replay__head">
        <h3>{bundle.info.raceName} · 재생</h3>
        <button type="button" className="btn" onClick={() => setSkipSignal((n) => n + 1)}>
          결과로 건너뛰기
        </button>
      </header>
      {load.message !== null && <p role="alert">{load.message}</p>}
      <div className="rd-replay__viewer" style={{ overflowX: 'auto' }}>
        <RaceViewer
          replay={bundle.output.sim.replay!}
          result={bundle.output.sim.result}
          path={bundle.output.path}
          info={bundle.info}
          commentary={bundle.commentary}
          verdicts={bundle.verdicts}
          width={REPLAY_WIDTH}
          onFinished={onFinished}
          skipToResult={skipSignal}
        />
      </div>
    </section>
  );
}
