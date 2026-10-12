import { describe, expect, it } from 'vitest';
import type { Silks, SilksPattern } from '../../src/engine/types';
import { drawSilksDisc } from '../../src/ui/race-viewer/silks';
import { discBorderFor } from '../../src/ui/race-viewer/viewModel';

// ── 기록용 가짜 ctx (stripRenderer.test.ts 와 같은 방식) ────────────────
interface Call {
  name: string;
  args: unknown[];
}

function recordingCtx(): { ctx: CanvasRenderingContext2D; calls: Call[] } {
  const calls: Call[] = [];
  const state: Record<string, unknown> = {};
  const ctx = new Proxy(state, {
    get(target, prop) {
      if (typeof prop !== 'string') return undefined;
      if (prop in target) return target[prop];
      return (...args: unknown[]) => {
        calls.push({ name: prop, args });
        return undefined;
      };
    },
    set(target, prop, value) {
      if (typeof prop === 'string') {
        calls.push({ name: `set:${prop}`, args: [value] });
        target[prop] = value;
      }
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

const PATTERNS: readonly SilksPattern[] = [
  'plain',
  'hoops',
  'stripes',
  'quartered',
  'sash',
  'chevrons',
  'spots',
  'star',
];

const PRIMARY = '#1040c0';
const SECONDARY = '#ffd100';

function silksOf(pattern: SilksPattern): Silks {
  return { primary: PRIMARY, secondary: SECONDARY, pattern };
}

function traceOf(pattern: SilksPattern): Call[] {
  const { ctx, calls } = recordingCtx();
  drawSilksDisc(ctx, 100, 100, 13, silksOf(pattern));
  return calls;
}

/** 무늬 고유 호출 패턴(이름 + 인자). 원 바탕(base fill)과 테두리는 공통이라 제외한다. */
function signatureOf(calls: Call[]): string {
  return JSON.stringify(calls.map((c) => [c.name, c.args]));
}

function countOf(calls: Call[], name: string): number {
  return calls.filter((c) => c.name === name).length;
}

/** 첫 restore(원 안 블록 끝)의 위치 */
function clipBlockEnd(calls: Call[]): number {
  const clipAt = calls.findIndex((c) => c.name === 'clip');
  return calls.findIndex((c, i) => i > clipAt && c.name === 'restore');
}

/** 무늬 그리기 구간: 바탕 fillRect 다음부터 원 안 블록의 restore 전까지 */
function patternCalls(calls: Call[]): Call[] {
  const clipAt = calls.findIndex((c) => c.name === 'clip');
  const baseAt = calls.findIndex((c, i) => i > clipAt && c.name === 'fillRect');
  return calls.slice(baseAt + 1, clipBlockEnd(calls));
}

describe('drawSilksDisc', () => {
  it('8가지 무늬가 모두 fill 또는 stroke 를 낸다', () => {
    for (const pattern of PATTERNS) {
      const calls = traceOf(pattern);
      expect(countOf(calls, 'fill') + countOf(calls, 'stroke')).toBeGreaterThan(0);
    }
  });

  it('8가지 무늬의 그리기 호출 패턴이 서로 모두 다르다', () => {
    const signatures = new Set(PATTERNS.map((p) => signatureOf(traceOf(p))));
    expect(signatures.size).toBe(PATTERNS.length);
  });

  it('모든 무늬는 clip 을 한 번 쓰고, clip 앞에는 원 경로(arc)만 있다', () => {
    for (const pattern of PATTERNS) {
      const calls = traceOf(pattern);
      expect(countOf(calls, 'clip')).toBe(1);
      const clipAt = calls.findIndex((c) => c.name === 'clip');
      expect(calls.slice(0, clipAt).map((c) => c.name)).toEqual(['save', 'beginPath', 'arc']);
    }
  });

  it('save 와 restore 호출 수가 같다', () => {
    for (const pattern of PATTERNS) {
      const calls = traceOf(pattern);
      expect(countOf(calls, 'save')).toBe(countOf(calls, 'restore'));
    }
  });

  it('무늬별 기본 도형 수: 띠 3, 줄 3, 4분할 2, 대각선 1, V자 2, 점 5, 별 1다각형', () => {
    expect(countOf(patternCalls(traceOf('hoops')), 'fillRect')).toBe(3);
    expect(countOf(patternCalls(traceOf('stripes')), 'fillRect')).toBe(3);
    expect(countOf(patternCalls(traceOf('quartered')), 'fillRect')).toBe(2);
    expect(countOf(patternCalls(traceOf('sash')), 'stroke')).toBe(1);
    expect(countOf(patternCalls(traceOf('chevrons')), 'stroke')).toBe(2);
    expect(countOf(patternCalls(traceOf('spots')), 'arc')).toBe(5);
    expect(countOf(patternCalls(traceOf('star')), 'fill')).toBe(1);
    const plainDraws = patternCalls(traceOf('plain')).filter((c) => !c.name.startsWith('set:'));
    expect(plainDraws).toEqual([]);
  });

  it('무늬 색은 보조색, 바탕은 주색이다', () => {
    const calls = traceOf('hoops');
    const fills = calls.filter((c) => c.name === 'set:fillStyle').map((c) => c.args[0]);
    expect(fills[0]).toBe(PRIMARY);
    expect(fills).toContain(SECONDARY);
  });

  it('테두리는 clip 블록 밖에서 discBorderFor(주색) 색으로 그린다', () => {
    for (const pattern of PATTERNS) {
      const calls = traceOf(pattern);
      const borderPart = calls.slice(clipBlockEnd(calls) + 1);
      expect(borderPart.some((c) => c.name === 'stroke')).toBe(true);
      const lastStrokeStyle = [...borderPart].reverse().find((c) => c.name === 'set:strokeStyle');
      expect(lastStrokeStyle?.args[0]).toBe(discBorderFor(PRIMARY));
      expect(borderPart.some((c) => c.name === 'clip')).toBe(false);
    }
  });
});
