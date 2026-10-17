import { useEffect, useMemo, useRef } from 'react';
import type { JSX } from 'react';
import type { GameState, RaceDayBrief } from '../../engine/types';
import RaceViewer from '../race-viewer/RaceViewer';
import { buildReplay, replayKey } from '../season/replayView';
import type { ReplayBundle } from '../season/replayView';
import { findReplayEntry } from './raceDayView';

/** RaceViewer 의 '결과만' 버튼 글자. RaceViewer 를 고치지 않고 건너뛰기에 쓴다. */
const VIEWER_RESULT_BUTTON = '결과만';
/** RaceViewer 가 재생이 끝나면 그리는 한 줄 평 목록(끝났다는 표시) */
const VIEWER_FINISHED_SELECTOR = '.race-viewer-verdicts';

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
 * 출주 후 자동 재생(M7-RD). RaceViewer 의 재생이 끝나면(한 줄 평이 그려지면) onFinished 를 부른다.
 * '결과로 건너뛰기'는 RaceViewer 의 '결과만' 버튼을 누른다.
 */
export default function RaceDayReplay({ state, brief, onFinished }: RaceDayReplayProps): JSX.Element | null {
  const load = useMemo(() => loadReplay(state, brief), [state, brief]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const bundle = load.bundle;
  const hasBundle = bundle !== null;

  // 재생 기록이 없거나 불러오지 못하면 바로 결과로 넘긴다.
  useEffect(() => {
    if (!hasBundle) onFinished();
  }, [hasBundle, onFinished]);

  // RaceViewer 가 끝나면 한 줄 평 목록이 그려진다. 그 순간을 잡아 결과로 넘긴다.
  useEffect(() => {
    const element = containerRef.current;
    if (element === null || !hasBundle) return undefined;
    const observer = new MutationObserver(() => {
      if (element.querySelector(VIEWER_FINISHED_SELECTOR) !== null) {
        observer.disconnect();
        onFinished();
      }
    });
    observer.observe(element, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [hasBundle, onFinished]);

  if (bundle === null) return null;

  const skip = (): void => {
    const buttons = containerRef.current?.querySelectorAll('button') ?? [];
    Array.from(buttons).find((b) => b.textContent === VIEWER_RESULT_BUTTON)?.click();
  };

  return (
    <section className="rd-replay" aria-label="레이스 재생">
      <header className="rd-replay__head">
        <h3>{bundle.info.raceName} · 재생</h3>
        <button type="button" className="btn" onClick={skip}>
          결과로 건너뛰기
        </button>
      </header>
      {load.message !== null && <p role="alert">{load.message}</p>}
      <div ref={containerRef} className="rd-replay__viewer" style={{ overflowX: 'auto' }}>
        <RaceViewer
          replay={bundle.output.sim.replay!}
          result={bundle.output.sim.result}
          path={bundle.output.path}
          info={bundle.info}
          commentary={bundle.commentary}
          verdicts={bundle.verdicts}
        />
      </div>
    </section>
  );
}
