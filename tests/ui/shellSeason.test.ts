import { describe, expect, it } from 'vitest';
import { PHASE_WINDOWS } from '../../src/engine/config/game';
import { BOOKING_OPEN_WEEK } from '../../src/engine/config/stud';
import { isInWindows } from '../../src/engine/time/calendar';
import { SEASON_BADGE_MAX, seasonLabel, yearlingSaleWeeks } from '../../src/ui/shell/seasonBadge';

const at = (week: number) => ({ year: 2026, week });

describe('seasonLabel (M6-U2 A4)', () => {
  it('1~6주는 올웨더 시즌만(번식·예약·세일 아님)', () => {
    expect(seasonLabel(at(1))).toEqual(['올웨더 시즌']);
    expect(seasonLabel(at(6))).toEqual(['올웨더 시즌']);
  });

  it('번식 창 안의 올웨더 주는 올웨더와 번식 시즌 두 개', () => {
    expect(seasonLabel(at(10))).toEqual(['올웨더 시즌', '번식 시즌']);
  });

  it('번식 창 안의 잔디 주는 잔디와 번식 시즌', () => {
    expect(seasonLabel(at(20))).toEqual(['잔디 시즌', '번식 시즌']);
  });

  it('번식이 끝난 뒤 1세 세일 전 잔디 주는 잔디 시즌만', () => {
    expect(seasonLabel(at(28))).toEqual(['잔디 시즌']);
  });

  it('1세 세일 주 범위는 잔디 시즌과 1세 세일 시기', () => {
    const sale = yearlingSaleWeeks();
    expect(sale).not.toBeNull();
    expect(seasonLabel(at(sale!.first))).toEqual(['잔디 시즌', '1세 세일 시기']);
    expect(seasonLabel(at(sale!.last))).toEqual(['잔디 시즌', '1세 세일 시기']);
    expect(seasonLabel(at(sale!.first - 1))).not.toContain('1세 세일 시기');
    expect(seasonLabel(at(sale!.last + 1))).not.toContain('1세 세일 시기');
  });

  it('BOOKING_OPEN_WEEK 부터 교배 예약 기간', () => {
    expect(seasonLabel(at(BOOKING_OPEN_WEEK - 1))).not.toContain('교배 예약 기간');
    expect(seasonLabel(at(BOOKING_OPEN_WEEK))).toEqual(['잔디 시즌', '교배 예약 기간']);
    expect(seasonLabel(at(50))).toEqual(['올웨더 시즌', '교배 예약 기간']);
  });

  it('잔디·올웨더 경계는 PHASE_WINDOWS 와 일치한다', () => {
    for (let week = 1; week <= 52; week += 1) {
      const surface = seasonLabel(at(week))[0];
      if (isInWindows(week, PHASE_WINDOWS.turf_flat)) expect(surface).toBe('잔디 시즌');
      else expect(surface).toBe('올웨더 시즌');
    }
  });

  it('모든 주에서 1~2개만 돌려주고 연도는 판정에 쓰지 않는다', () => {
    for (let week = 1; week <= 52; week += 1) {
      const labels = seasonLabel(at(week));
      expect(labels.length).toBeGreaterThanOrEqual(1);
      expect(labels.length).toBeLessThanOrEqual(SEASON_BADGE_MAX);
      expect(seasonLabel({ year: 2031, week })).toEqual(labels);
    }
  });

  it('같은 입력은 같은 결과(순수 함수)', () => {
    expect(seasonLabel(at(33))).toEqual(seasonLabel(at(33)));
  });
});

describe('yearlingSaleWeeks', () => {
  it('정적 세일 데이터의 1세 세일 주 범위를 돌려준다', () => {
    const sale = yearlingSaleWeeks();
    expect(sale).not.toBeNull();
    expect(sale!.first).toBeGreaterThanOrEqual(1);
    expect(sale!.last).toBeLessThanOrEqual(52);
    expect(sale!.first).toBeLessThanOrEqual(sale!.last);
  });
});
