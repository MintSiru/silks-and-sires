import { beforeAll, describe, expect, it } from 'vitest';
import * as data from '../../src/engine/data/staticData';
import { upcomingRaces } from '../../src/engine/season/lookahead';
import { buildWeekMeetings } from '../../src/engine/season/meetings';
import { weekOfSlot } from '../../src/engine/season/schedule';
import { bootstrapGame } from '../../src/engine/state/bootstrap';
import { addWeeks } from '../../src/engine/time/calendar';
import { createRng } from '../../src/engine/rng';
import type { GameState } from '../../src/engine/types';

const staticData = {
  ...data.getPeopleData(), courses: data.getRacecourses(), templates: data.getRaceTemplates(),
  series: data.getSeriesDefinitions(), nicks: data.getNicks(), naming: data.getNamingData(),
  stallionNames: data.getStallionNames(), stallionRecords: data.getStallionRecords(),
};
let base: GameState;
beforeAll(() => { base = bootstrapGame({ seed: 20261011, playerName: '가상 마주',
  silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' } }, staticData); }, 120_000);

describe('12주 미리보기', () => {
  it('고정 일정·조건은 원본 데이터와 일치하고 상태·공용 RNG 를 바꾸지 않는다', () => {
    const before = JSON.stringify(base);
    const weeks = upcomingRaces(base, staticData, base.date, 12);
    expect(weeks).toHaveLength(12);
    for (const [index, week] of weeks.entries()) {
      expect(week.date).toEqual(addWeeks(base.date, index));
      expect(week.fixedRaces).toEqual(staticData.templates.filter((t) => weekOfSlot(t.schedule) === week.date.week)
        .sort((a, b) => a.racecourseId.localeCompare(b.racecourseId) || a.cardOrder - b.cardOrder || a.id.localeCompare(b.id)));
      for (const race of week.fixedRaces) {
        expect(week.meetings.some((m) => m.course.id === race.racecourseId && m.certainty !== 'possible')).toBe(true);
      }
    }
    expect(upcomingRaces(base, staticData, base.date, 12)).toEqual(weeks);
    expect(JSON.stringify(base)).toBe(before);
    const fixed = upcomingRaces(base, staticData, { year: 2026, week: 13 }, 12).flatMap((w) => w.fixedRaces)[0]!;
    fixed.conditions.minAge = 99;
    expect(staticData.templates.find((t) => t.id === fixed.id)!.conditions.minAge).not.toBe(99);
  });

  it('생성된 주는 확정 개최만, 미래 주는 추첨 가능한 후보를 표시한다', () => {
    const weeks = upcomingRaces(base, staticData, base.date, 16);
    const confirmed = weeks[1]!;
    expect(confirmed.meetings.map((m) => m.course.id).sort())
      .toEqual(base.seasonState.meetings.map((m) => m.racecourseId).sort());
    expect(confirmed.meetings.every((m) => m.certainty === 'confirmed')).toBe(true);
    expect(weeks[2]!.meetings.some((m) => m.certainty === 'possible')).toBe(true);
    expect(weeks[2]!.meetings.filter((m) => m.certainty === 'possible').every((m) => m.course.surface === 'aw')).toBe(true);
    expect(weeks[12]!.meetings.filter((m) => m.certainty === 'possible').every((m) => m.course.surface === 'turf')).toBe(true);
  });

  it('시즌별 종류·클래스·거리·2세 제한은 실제 자동 생성 편성을 포함한다', () => {
    for (const week of [3, 13, 15, 22, 40, 46]) {
      const date = { year: 2026, week };
      const preview = upcomingRaces(base, staticData, date, 1)[0]!;
      const actual = buildWeekMeetings({ date, ...staticData, rng: createRng(`preview-${week}`), nextGeneratedRace: 0 });
      for (const meeting of actual.meetings) {
        const expected = preview.meetings.find((m) => m.course.id === meeting.racecourseId)!;
        expect(expected).toBeDefined();
        expect(expected.expectedKinds.reduce((sum, k) => sum + k.weight, 0)).toBeCloseTo(1);
        for (const kind of expected.expectedKinds) {
          expect(kind.classes.reduce((sum, c) => sum + c.weight, 0)).toBeCloseTo(1);
          expect(kind.distances.reduce((sum, d) => sum + d.weight, 0)).toBeCloseTo(1);
        }
        for (const sr of meeting.races.filter((r) => r.templateId === null)) {
          const kind = expected.expectedKinds.find((k) => k.kind === sr.race.kind)!;
          expect(kind.classes.some((c) => c.raceClass === sr.race.raceClass)).toBe(true);
          expect(kind.distances.some((d) => d.distance === sr.race.distance)).toBe(true);
          if (sr.race.conditions.maxAge === 2) expect(kind.twoYearOldDistances).toContain(sr.race.distance);
        }
      }
    }
  });

  it('연말을 넘는 일정과 0주·잘못된 기간을 처리한다', () => {
    const weeks = upcomingRaces(base, staticData, { year: 2026, week: 51 }, 12);
    expect(weeks[2]!.date).toEqual({ year: 2027, week: 1 });
    expect(weeks[11]!.date).toEqual({ year: 2027, week: 10 });
    expect(upcomingRaces(base, staticData, base.date, 0)).toEqual([]);
    for (const count of [-1, 1.5, NaN, Infinity]) expect(() => upcomingRaces(base, staticData, base.date, count)).toThrow(RangeError);
  });
});
