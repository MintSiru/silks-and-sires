import { describe, expect, it } from 'vitest';
import { createNewGame } from '../../src/engine/state/newGame';
import { MIGRATIONS, applyMigrations } from '../../src/engine/save/serialize';
import { advanceWeekGated, yearEndPending } from '../../src/engine/stud/yearEnd';
import { calendarSystem } from '../../src/engine/time/advance';
import { START_YEAR } from '../../src/engine/config/game';
import { STUD_BASE_SLOTS } from '../../src/engine/config/stud';
import type { GameState } from '../../src/engine/types';

const silks = { primary: '#1f4e79', secondary: '#f2c200', pattern: 'hoops' } as const;

function fresh(): GameState {
  return createNewGame({ seed: 7, playerName: '테스트', silks: { ...silks } });
}

describe('연말 정산 게이트 (M4-D1a)', () => {
  it('새 게임은 시작 연도 정산을 마친 상태다(첫해에는 대기 없음)', () => {
    const s = fresh();
    expect(s.yearEnd).toEqual({ lastSubmittedYear: START_YEAR, declinedRenewals: [] });
    expect(s.stud).toEqual({ slots: STUD_BASE_SLOTS, seasons: [], nominations: [], leases: [], sales: [] });
    expect(yearEndPending(s)).toBe(false);
  });

  it('새해 1주에 제출 기록이 없으면 대기, advanceWeekGated 는 같은 state·blocked 를 돌려준다', () => {
    const s = fresh();
    s.date = { year: START_YEAR + 1, week: 1 };
    expect(yearEndPending(s)).toBe(true);
    const r = advanceWeekGated(s, [calendarSystem]);
    expect(r.blocked).toBe('year_end');
    expect(r.state).toBe(s);
    expect(r.events).toEqual([]);
  });

  it('제출 기록이 있으면 평소처럼 진행한다', () => {
    const s = fresh();
    s.date = { year: START_YEAR + 1, week: 1 };
    s.yearEnd.lastSubmittedYear = START_YEAR + 1;
    const r = advanceWeekGated(s, [calendarSystem]);
    expect(r.blocked).toBeNull();
    expect(r.state.date).toEqual({ year: START_YEAR + 1, week: 2 });
  });

  it('1주가 아니면 제출 기록과 상관없이 진행한다', () => {
    const s = fresh();
    s.date = { year: START_YEAR + 1, week: 30 };
    expect(yearEndPending(s)).toBe(false);
    expect(advanceWeekGated(s, [calendarSystem]).blocked).toBeNull();
  });

  it('v14 → v15 마이그레이션: 저장본 연도로 정산 완료 처리, 기본 종마사 칸', () => {
    const old = { date: { year: 2031, week: 1 } } as Record<string, unknown>;
    const out = applyMigrations(old, 14, 15, MIGRATIONS);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.state.yearEnd).toEqual({ lastSubmittedYear: 2031, declinedRenewals: [] });
    expect(out.state.stud).toEqual({ slots: STUD_BASE_SLOTS, seasons: [] });
  });

  it('v16 → v17 마이그레이션: 교배권·임대·판매 기록 빈 목록 (M4-D4)', () => {
    const old = { stud: { slots: 2, seasons: [] } } as Record<string, unknown>;
    const out = applyMigrations(old, 16, 17, MIGRATIONS);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.state.stud).toEqual({ slots: 2, seasons: [], nominations: [], leases: [], sales: [] });
  });

  it('v15 → v16 마이그레이션: 종마에 예약 시즌(저장 연도)·AI 예약 0 (M4-D3)', () => {
    const old = { date: { year: 2030, week: 20 }, stallions: { s1: { horseId: 's1', bookedThisSeason: 3 } } } as Record<string, unknown>;
    const out = applyMigrations(old, 15, 16, MIGRATIONS);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect((out.state.stallions as Record<string, unknown>).s1).toEqual({
      horseId: 's1', bookedThisSeason: 3, bookingSeason: 2030, aiBooked: 0, aiDemand: 0,
    });
  });
});
