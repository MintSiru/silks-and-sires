import { useEffect, useMemo, useRef, useState } from 'react';
import type { JSX } from 'react';
import type { RacePath, RaceReplay, RaceResult } from '../../engine/types';
import { buildStripModel, replayDuration } from './viewModel';
import type { ViewerInfo } from './viewModel';
import { drawStrip } from './stripRenderer';

export interface RaceViewerProps {
  replay: RaceReplay;
  result: RaceResult;
  path: RacePath;
  info: ViewerInfo;
  width?: number;
  height?: number;
}

type Speed = 1 | 2 | 4;
const SPEEDS: readonly Speed[] = [1, 2, 4];
const DEFAULT_WIDTH = 1200;
const DEFAULT_HEIGHT = 200;

export default function RaceViewer(props: RaceViewerProps): JSX.Element {
  const { replay, result, path, info } = props;
  const width = props.width ?? DEFAULT_WIDTH;
  const height = props.height ?? DEFAULT_HEIGHT;

  const duration = useMemo(() => replayDuration(replay), [replay]);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<Speed>(1);
  const [t, setT] = useState(0);
  // rAF 콜백은 최신 t 를 ref 로 읽고 쓴다(state 를 콜백 안에서 읽지 않기 위함)
  const tRef = useRef(0);
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
    if (tRef.current >= duration) seek(0);
    setPlaying(true);
  };

  const showResult = (): void => {
    setPlaying(false);
    seek(duration);
  };

  const restart = (): void => {
    seek(0);
    setPlaying(true);
  };

  return (
    <div className="race-viewer">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`${info.raceName} 레이스 뷰어`}
        style={{ display: 'block' }}
      />
      <div className="race-viewer-controls">
        <button type="button" onClick={togglePlay}>
          {playing ? '일시정지' : '재생'}
        </button>
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={speed === s}
            className={speed === s ? 'is-active' : undefined}
            onClick={() => setSpeed(s)}
          >
            {`${s}×`}
          </button>
        ))}
        <button type="button" onClick={showResult}>
          결과만
        </button>
        <button type="button" onClick={restart}>
          처음부터
        </button>
      </div>
    </div>
  );
}
