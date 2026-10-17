import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createNewGame } from '../../src/engine/state/newGame';
import { generateHorse } from '../../src/engine/horse/generate';
import { createRng } from '../../src/engine/rng';
import { getRacecourses, getRaceTemplates } from '../../src/engine/data/staticData';
import { upcomingRaces, type UpcomingRaceWeek } from '../../src/engine/season/lookahead';
import { addWeeks } from '../../src/engine/time/calendar';
import type { GameState, PlannedRace, RaceTemplate } from '../../src/engine/types';
import {
  calendarDistanceLabel,
  calendarPlayerEntries,
  calendarWeekRows,
  CALENDAR_FIXED_PREVIEW_COUNT,
} from '../../src/ui/season/calendarView';
import SeasonScreen from '../../src/ui/season/SeasonScreen';
import type { GameApi } from '../../src/ui/game/useGame';

function fixture() {
  const state = createNewGame({
    seed: 20261017,
    playerName: '구름 마주',
    silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' },
  });
  const horse = generateHorse(createRng('u7'), {
    id: 'u7-horse',
    name: '구름별',
    birthYear: state.date.year - 3,
    currentYear: state.date.year,
    sex: 'female',
    countryOfBirth: 'GB',
    status: 'in_training',
    level: 60,
  });
  horse.ownerId = state.playerOwnerId;
  horse.trainerId = Object.values(state.trainers).find((t) => t.country === 'GB')?.id ?? null;
  state.horses[horse.id] = horse;
  const plan: PlannedRace = {
    id: 'u7-plan',
    date: addWeeks(state.date, 1),
    templateId: null,
    target: {
      kinds: ['handicap'],
      minDistance: 1248,
      maxDistance: 2165,
      minClass: 5,
      maxClass: 5,
      country: 'IE',
    },
    status: 'proposed',
    note: '거리 적성에 맞춤',
  };
  state.seasonState.racePlans = { [horse.id]: [plan] };
  return { state, horse, plan };
}

function weeksOf(state: GameState): UpcomingRaceWeek[] {
  return upcomingRaces(state, { courses: getRacecourses(), templates: getRaceTemplates() }, state.date, 12);
}

/** 같은 주에 등급이 다른 고정 레이스를 억지로 만든 주(정렬·상한 검사용). 경마장·날짜는 실제 주를 쓴다. */
function weekWithGrades(base: UpcomingRaceWeek, grades: (RaceTemplate['grade'])[]): UpcomingRaceWeek {
  const template = getRaceTemplates()[0]!;
  const fixedRaces = grades.map((grade, i) => ({
    ...template,
    id: `synthetic-${i}`,
    name: `가상 레이스 ${i + 1}`,
    grade,
  }));
  return { ...base, fixedRaces, meetings: [], minorMeetingCount: [] };
}

describe('M6-U7 경주 캘린더 뷰', () => {
  it('주별 행은 12주이고 접힌 행은 주요 고정 레이스 최대 2개와 외 N 을 준다', () => {
    const { state } = fixture();
    const weeks = weeksOf(state);
    const rows = calendarWeekRows(weeks, state);
    expect(rows).toHaveLength(12);
    expect(rows[0]!.dateLabel).toMatch(/\d+년/);
    for (const row of rows) {
      expect(row.fixedPreview.length).toBeLessThanOrEqual(CALENDAR_FIXED_PREVIEW_COUNT);
      expect(row.fixedPreview.length + row.fixedMoreCount).toBe(row.fixed.length);
    }
  });

  it('고정 레이스는 G1, G2, G3, 리스티드, 등급 없음 순으로 정렬하고 접힌 행에는 앞 2개만 준다', () => {
    const { state } = fixture();
    const base = weeksOf(state)[0]!;
    const rows = calendarWeekRows([weekWithGrades(base, [null, 'G3', 'G2', 'G1'])], state);
    const row = rows[0]!;
    expect(row.fixed.map((r) => r.grade)).toEqual(['G1', 'G2', 'G3', null]);
    expect(row.fixedPreview.map((r) => r.grade)).toEqual(['G1', 'G2']);
    expect(row.fixedMoreCount).toBe(2);
    expect(row.fixed[0]!.gradeLabel).toBe('G1');
  });

  it('같은 등급끼리는 원래 순서를 지킨다', () => {
    const { state } = fixture();
    const base = weeksOf(state)[0]!;
    const rows = calendarWeekRows([weekWithGrades(base, ['G3', 'G3', 'G3'])], state);
    expect(rows[0]!.fixed.map((r) => r.name)).toEqual(['가상 레이스 1', '가상 레이스 2', '가상 레이스 3']);
    expect(rows[0]!.fixedMoreCount).toBe(1);
  });

  it('일반 개최 요약은 접힌 행에 곳 수만, 펼친 행에 나라별 수를 준다', () => {
    const { state } = fixture();
    const base = weeksOf(state)[0]!;
    const withMeetings = calendarWeekRows(
      [
        {
          ...base,
          fixedRaces: [],
          meetings: [],
          minorMeetingCount: [
            { country: 'GB', count: 2 },
            { country: 'IE', count: 0 },
            { country: 'FR', count: 1 },
          ],
        },
      ],
      state,
    )[0]!;
    expect(withMeetings.generalSummary).toBe('일반 개최 3곳');
    expect(withMeetings.generalDetail).toBe('영국 2곳, 프랑스 1곳');
    expect(withMeetings.fixedPreview).toEqual([]);

    const none = calendarWeekRows(
      [{ ...base, fixedRaces: [], meetings: [], minorMeetingCount: [{ country: null, count: 0 }] }],
      state,
    )[0]!;
    expect(none.generalSummary).toBe('일반 개최 없음');
    expect(none.generalDetail).toBe('없음');
  });

  it('내 말 칩은 계획(제안·승인)을 계획, 출주 신청을 신청으로 구분하고 다른 주 계획은 뺀다', () => {
    const { state, horse, plan } = fixture();
    const weeks = weeksOf(state);
    const entries = calendarPlayerEntries(state, weeks[1]!.date);
    expect(entries).toEqual([{ horseId: horse.id, name: horse.name, kind: 'planned', label: '계획' }]);
    expect(calendarPlayerEntries(state, weeks[2]!.date)).toEqual([]);

    const declared = { ...plan, status: 'declared' as const };
    state.seasonState.racePlans = { [horse.id]: [declared] };
    expect(calendarPlayerEntries(state, weeks[1]!.date)[0]).toMatchObject({ kind: 'declared', label: '신청' });

    const rows = calendarWeekRows(weeks, state);
    expect(rows[1]!.horsePreview).toHaveLength(1);
    expect(rows[1]!.horseMoreCount).toBe(0);
    expect(rows[1]!.playerEntries[0]!.label).toBe('신청');
  });

  it('거리 칸은 천 단위 쉼표와 m 을 쓰고 펼친 행의 경마장 목록은 확정·예정·후보 문구를 가진다', () => {
    expect(calendarDistanceLabel(1600)).toBe('1,600m');
    const { state } = fixture();
    const weeks = weeksOf(state);
    const rows = calendarWeekRows(weeks, state);
    const meetingRow = rows.find((r) => r.meetings.length > 0)!;
    expect(meetingRow.meetings[0]!.certaintyLabel).toMatch(/ · (개최 확정|고정 일정|개최 후보)$/);
    expect(meetingRow.meetings[0]!.expectedLabel).toMatch(/%/);
  });
});

describe('M6-U7 경주 캘린더 화면', () => {
  it('12주 행은 모두 접힌 버튼으로 나오고 내용은 펼칠 때만 보인다, 말 계획 관리 안내를 준다', () => {
    const { state, horse } = fixture();
    const weeks = weeksOf(state);
    const game = {
      state,
      upcomingRaces: () => weeks,
      declarePlayerHorse: () => ({ ok: false, error: 'not_found' }),
      withdrawPlayerHorse: () => ({ ok: false, error: 'not_found' }),
    } as unknown as GameApi;
    const html = renderToStaticMarkup(createElement(SeasonScreen, { game, section: 'calendar' }));
    expect(html).toContain('앞으로 12주 레이스');
    expect(html.match(/class="cal-week__head"/g)).toHaveLength(12);
    expect(html.match(/aria-expanded="false"/g)).toHaveLength(12);
    expect(html.match(/class="cal-week__detail" hidden=""/g)).toHaveLength(12);
    expect(html).toContain('말 상세에서 계획 관리');
    expect(html).toContain('계획 · ');
    expect(html).toContain(horse.name);
    expect(html).not.toContain('calendar-week');
    expect(html).not.toContain('조교사에게 다시 짜기');
  });
});
