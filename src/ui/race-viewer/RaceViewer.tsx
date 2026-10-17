import { useEffect, useMemo, useRef, useState } from 'react';
import type { JSX } from 'react';
import type { RacePath, RaceReplay, RaceResult } from '../../engine/types';
import { GATE_HOLD_S, buildStripModel, replayDuration } from './viewModel';
import type { ViewerInfo } from './viewModel';
import { drawStrip } from './stripRenderer';
import './raceViewer.css';

export interface RaceViewerProps {
  replay: RaceReplay;
  result: RaceResult;
  path: RacePath;
  info: ViewerInfo;
  width?: number;
  height?: number;
  /** 실황 자막. t 오름차순. 현재 시각 이하의 마지막 한 줄을 캔버스 아래에 보인다. */
  commentary?: { t: number; text: string }[];
  /** 레이스 후 한 줄 평. 착순대로 넘긴다. t ≥ duration 이면 목록으로 보인다. */
  verdicts?: { name: string; text: string }[];
}

type Speed = 1 | 2 | 4;
const SPEEDS: readonly Speed[] = [1, 2, 4];
const DEFAULT_WIDTH = 1200;
/** 좌측 고저 단면 띠와 미니맵이 함께 들어갈 높이 */
const DEFAULT_HEIGHT = 240;
/** 자막 줄 높이 유지(자막이 없을 때도 레이아웃이 흔들리지 않게) */
const SUBTITLE_STYLE = { minHeight: '1.6em', margin: '6px 0' } as const;

/** t 이하의 마지막 자막 문장. 없으면 빈 문자열. lines 는 t 오름차순이어야 한다. */
function subtitleAt(lines: readonly { t: number; text: string }[], t: number): string {
  let text = '';
  for (const line of lines) {
    if (line.t > t) break;
    text = line.text;
  }
  return text;
}

export default function RaceViewer(props: RaceViewerProps): JSX.Element {
  const { replay, result, path, info } = props;
  const commentary = props.commentary ?? [];
  const verdicts = props.verdicts ?? [];
  const width = props.width ?? DEFAULT_WIDTH;
  const height = props.height ?? DEFAULT_HEIGHT;

  const duration = useMemo(() => replayDuration(replay), [replay]);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<Speed>(1);
  // τ 는 −GATE_HOLD_S(게이트 대기)에서 시작한다. 음수 구간은 첫 프레임에 머문다.
  const [t, setT] = useState(-GATE_HOLD_S);
  // rAF 콜백은 최신 t 를 ref 로 읽고 쓴다(state 를 콜백 안에서 읽지 않기 위함)
  const tRef = useRef(-GATE_HOLD_S);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const seek = (value: number): void => {
    tRef.current = value;
    setT(value);
  };

  // 재생 루프: playing / speed / duration 이 바뀌면 다시 건다. 언마운트 시 취소.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const step = (now: number): void => {
      const dt = (now - last) / 1000;
      last = now;
      const next = Math.min(duration, tRef.current + dt * speed);
      tRef.current = next;
      setT(next);
      if (next >= duration) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, duration]);

  const model = useMemo(
    () => buildStripModel({ replay, t, path, info, result, width, height }),
    [replay, t, path, info, result, width, height],
  );

  // 캔버스 그리기: devicePixelRatio 로 스케일
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const dpr = window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawStrip(ctx, model);
  }, [model, width, height]);

  const togglePlay = (): void => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (tRef.current >= duration) seek(-GATE_HOLD_S);
    setPlaying(true);
  };

  const showResult = (): void => {
    setPlaying(false);
    seek(duration);
  };

  const restart = (): void => {
    seek(-GATE_HOLD_S);
    setPlaying(true);
  };

  const finished = t >= duration;
  const subtitle = subtitleAt(commentary, t);

  return (
    <div className="race-viewer">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`${info.raceName} 레이스 뷰어`}
        style={{ display: 'block' }}
      />
      <div className="race-viewer-subtitle" aria-live="polite" style={SUBTITLE_STYLE}>
        {subtitle}
      </div>
      <div className="race-viewer-controls">
        <button type="button" className="btn" onClick={togglePlay}>
          {playing ? '일시정지' : '재생'}
        </button>
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            className={speed === s ? 'btn btn--primary' : 'btn'}
            aria-pressed={speed === s}
            onClick={() => setSpeed(s)}
          >
            {`${s}×`}
          </button>
        ))}
        <button type="button" className="btn" onClick={showResult}>
          결과만
        </button>
        <button type="button" className="btn" onClick={restart}>
          처음부터
        </button>
      </div>
      {finished && verdicts.length > 0 && (
        <ol className="race-viewer-verdicts" aria-label="한 줄 평">
          {verdicts.map((v, i) => (
            <li key={`${i}-${v.name}`}>{v.text}</li>
          ))}
        </ol>
      )}
    </div>
  );
}
