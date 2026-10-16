import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createNewGame } from '../../src/engine/state/newGame';
import { generateHorse } from '../../src/engine/horse/generate';
import { createRng } from '../../src/engine/rng';
import { TWO_YO_FROM_WEEK } from '../../src/engine/config/meetings';
import { getRacecourses, getRaceTemplates, getSalesData } from '../../src/engine/data/staticData';
import { upcomingRaces } from '../../src/engine/season/lookahead';
import { addWeeks, formatDateKo } from '../../src/engine/time/calendar';
import type { GameState, PlannedRace } from '../../src/engine/types';
import { homeView } from '../../src/ui/home/homeView';
import { stableRows } from '../../src/ui/stable/stableView';
import {
  emptyRacePlanHint,
  racePlanRows,
  racePlanSections,
  targetLabel,
  upcomingRaceRows,
} from '../../src/ui/season/racePlanView';
import { gradeTextColor } from '../../src/ui/game/text';
import { nearSaleCalendar } from '../../src/ui/sales/salesLayoutView';
import { saleCalendarRows } from '../../src/ui/sales/salesView';
import NewGameScreen from '../../src/ui/newGame/NewGameScreen';
import type { GameApi } from '../../src/ui/game/useGame';
import HomeScreen from '../../src/ui/home/HomeScreen';

function fixture() {
  const state = createNewGame({
    seed: 20261016,
    playerName: '구름 마주',
    silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' },
  });
  const horse = generateHorse(createRng('ux3'), {
    id: 'ux3-horse',
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
    id: 'ux3-plan',
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

describe('UX3 출주 계획·마구간', () => {
  it('중간 거리를 100m로 반올림하고 단일 클래스와 원정국을 읽기 쉽게 표시한다', () => {
    const { plan } = fixture();
    expect(targetLabel(plan.target!)).toBe('핸디캡 · 약 1,700m 전후 · 클래스 5');
    expect(targetLabel({ ...plan.target!, minClass: 4 })).toContain('클래스 4~5');
    expect(
      targetLabel({ ...plan.target!, minClass: undefined, maxClass: undefined }),
    ).not.toContain('클래스');
    expect(racePlanRows([plan], { country: 'GB' })[0]).toMatchObject({
      away: ' · 원정: 아일랜드',
      statusLabel: '조교사 제안(진행 예정)',
    });
    expect(racePlanRows([plan], { country: 'IE', requireApproval: true })[0]).toMatchObject({
      away: '',
      statusLabel: '검토 대기',
    });
    const race = getRaceTemplates().find(
      (r) => getRacecourses().find((c) => c.id === r.racecourseId)?.country === 'IE',
    )!;
    expect(
      racePlanRows([{ ...plan, target: null, templateId: race.id }], { country: 'GB' })[0]!.away,
    ).toContain('아일랜드');
  });
  it('진행 중 계획과 지난 계획을 분리하고 지난 기록은 날짜순 최근 3건으로 제한한다', () => {
    const { plan } = fixture();
    const plans = [
      plan,
      ...[2, 5, 1, 3, 4].map((week) => ({
        ...plan,
        id: `past-${week}`,
        date: { ...plan.date, week },
        status: week % 2 ? ('run' as const) : ('skipped' as const),
      })),
    ];
    const before = structuredClone(plans);
    const sections = racePlanSections(plans);
    expect(sections.active).toEqual([plan]);
    expect(sections.history.map((p) => p.date.week)).toEqual([5, 4, 3]);
    expect(sections.historyCount).toBe(5);
    expect(plans).toEqual(before);
  });
  it('기본 방식에서는 제안 검토 경고·할 일이 없고 승인제에서만 나타난다', () => {
    const { state, horse } = fixture();
    expect(stableRows(state, 'active')[0]!.warnings).not.toContain('제안 검토');
    expect(stableRows(state, 'active')[0]!.next).toContain('진행 예정');
    expect(homeView(state).tasks.some((t) => t.id === `plan:${horse.id}`)).toBe(false);
    state.settings.autoApproveRacePlans = false;
    expect(stableRows(state, 'active')[0]!.warnings).toContain('제안 검토');
    expect(stableRows(state, 'active')[0]!.next).toContain('검토 대기');
    expect(homeView(state).tasks.some((t) => t.id === `plan:${horse.id}`)).toBe(true);
  });
  it('계획이 없는 2세는 config의 데뷔 주, 성마는 부상·미배정·레이스 없음 사유를 보여 준다', () => {
    const { state, horse } = fixture();
    state.seasonState.racePlans = {};
    horse.birthYear = state.date.year - 2;
    const debut = formatDateKo({ year: state.date.year, week: TWO_YO_FROM_WEEK }).replace(
      /^\d+년 /,
      '',
    );
    expect(emptyRacePlanHint(state, horse)).toBe(`2세 데뷔 가능: ${debut}부터`);
    expect(stableRows(state, 'active')[0]!.next).toContain(debut);
    horse.birthYear--;
    horse.condition.injury = { kind: 'tendon', since: state.date, weeksOut: 8 };
    expect(emptyRacePlanHint(state, horse)).toContain('부상');
    horse.condition.injury = null;
    horse.trainerId = null;
    expect(emptyRacePlanHint(state, horse)).toContain('조교사 미배정');
    horse.trainerId = 'trainer';
    expect(emptyRacePlanHint(state, horse)).toContain('맞는 레이스가 없습니다');
    horse.birthYear = state.date.year - 2;
    state.date.week = TWO_YO_FROM_WEEK;
    expect(emptyRacePlanHint(state, horse)).not.toContain('부터');
  });
});

describe('UX3 홈·캘린더', () => {
  it('이번 주·다음 주 계획과 신청을 합치고 동일 말·주 신청이 있으면 계획을 중복 표시하지 않는다', () => {
    const { state, horse, plan } = fixture();
    const race = getRaceTemplates()[0]!;
    state.seasonState.racePlans![horse.id]!.push({
      ...plan,
      id: 'later',
      date: addWeeks(state.date, 2),
    });
    expect(homeView(state).entries).toHaveLength(1);
    state.seasonState.meetings = [
      {
        id: 'meeting',
        racecourseId: race.racecourseId,
        date: plan.date,
        going: 'good',
        races: [
          {
            race,
            templateId: race.id,
            status: 'open',
            simulated: false,
            declarations: [
              {
                horseId: horse.id,
                jockeyId: 'jockey',
                ownerId: state.playerOwnerId,
                trainerId: horse.trainerId ?? '',
                weightLb: 126,
                isPlayer: true,
              },
            ],
          },
        ],
      },
    ];
    expect(homeView(state).entries).toHaveLength(1);
    expect(homeView(state).entries[0]).toMatchObject({
      horseId: horse.id,
      weekLabel: '다음 주',
      statusLabel: '출주 신청됨',
      raceName: race.name,
    });
    state.date = plan.date;
    expect(homeView(state).entries[0]!.weekLabel).toBe('이번 주');
  });
  it('내 말 결과를 G1보다 먼저 고르고 내 말 이벤트만 최근 5건을 고른다', () => {
    const { state, horse } = fixture();
    const major = getRaceTemplates().find((r) => r.grade === 'G1')!;
    const result = (horseId: string, raceId: string): GameState['raceResults'][number] => ({
      raceId,
      racecourseId: major.racecourseId,
      date: state.date,
      going: 'good',
      distance: 1600,
      seed: 1,
      winningTime: 100,
      sectionalMarks: [],
      runners: [
        {
          horseId,
          jockeyId: 'jockey',
          position: 1,
          runnerIndex: 0,
          saddleCloth: 1,
          draw: 1,
          weightLb: 126,
          finishTime: 100,
          margin: null,
          beatenLengths: 0,
          sectionals: [],
          performanceFigure: 0,
          odds: null,
        },
      ],
    });
    state.raceResults = [
      result(horse.id, 'generated-player-race'),
      ...Array.from({ length: 5 }, () => result('world-horse', major.id)),
    ];
    state.eventLog = [
      ...Array.from({ length: 7 }, (_, i) => ({
        type: 'horse_named' as const,
        horseId: horse.id,
        name: `${i}`,
        auto: false,
        date: state.date,
      })),
      {
        type: 'horse_named',
        horseId: 'world-horse',
        name: '다른 말',
        auto: false,
        date: state.date,
      },
      {
        type: 'race_run',
        meetingId: 'world-meeting',
        raceId: major.id,
        winnerId: 'world-horse',
        playerHorseIds: [],
        date: state.date,
      },
    ];
    const view = homeView(state);
    expect(view.results).toHaveLength(1);
    expect(view.results[0]!.playerRuns[0]!.horseId).toBe(horse.id);
    expect(view.events).toHaveLength(5);
    expect(view.events[0]).toMatchObject({ name: '6' });
    expect(view.majorResult?.raceName).toBe(major.name);
    state.raceResults.shift();
    expect(
      renderToStaticMarkup(createElement(HomeScreen, { state, onNavigate: () => {} })),
    ).toContain('내 말 결과 없음');
  });
  it('겨울 주도 경마장·국가·예상 종류를 제공하고 내 계획과 신청을 이름 칩에 합친다', () => {
    const { state, horse, plan } = fixture();
    const weeks = upcomingRaces(
      state,
      { courses: getRacecourses(), templates: getRaceTemplates() },
      state.date,
      12,
    );
    const rows = upcomingRaceRows(weeks, state);
    expect(rows).toHaveLength(12);
    expect(rows[1]!.meetingSummary).toMatch(/\((영국|아일랜드|프랑스)\)/);
    expect(rows[1]!.kindsSummary).toContain('핸디캡');
    expect(rows[1]!.playerPlans).toEqual([{ horseId: horse.id, name: horse.name }]);
    plan.status = 'skipped';
    expect(upcomingRaceRows(weeks, state)[1]!.playerPlans).toEqual([]);
    const spring = upcomingRaceRows(
      upcomingRaces(
        state,
        { courses: getRacecourses(), templates: getRaceTemplates() },
        { year: state.date.year, week: 16 },
        12,
      ),
      state,
    );
    expect(spring.some((row) => /G[123]|리스티드/.test(row.fixedSummary))).toBe(true);
  });
});

describe('UX3 시작·가독성·세일 일정', () => {
  it('라디오와 체크박스는 한 줄 라벨이며 설정·승부복 영역을 나눈다', () => {
    const html = renderToStaticMarkup(
      createElement(NewGameScreen, { game: {} as GameApi, onDone: () => {} }),
    );
    expect(html).toContain('new-game__settings');
    expect(html.match(/class="choice-field"/g)).toHaveLength(9);
    expect(html).not.toMatch(/class="field"><input type="(?:radio|checkbox)"/);
    expect(html).toContain('시작 설정 도움말');
  });
  it('능력 등급 글자 토큰은 상세 배경에서 모두 WCAG AA 대비를 만족한다', () => {
    const luminance = (hex: string) => {
      const rgb = [1, 3, 5]
        .map((start) => parseInt(hex.slice(start, start + 2), 16) / 255)
        .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
    };
    for (const grade of ['S', 'A', 'B', 'C', 'D', 'E'] as const)
      expect(
        (luminance(gradeTextColor(grade)) + 0.05) / (luminance('#181e26') + 0.05),
      ).toBeGreaterThanOrEqual(4.5);
  });
  it('세일 기본 일정은 세 달이며 연말에 다음 해 일정도 포함한다', () => {
    const { state } = fixture();
    const rows = saleCalendarRows(state, { sales: getSalesData() });
    const sample = rows[0]!;
    const schedule = [
      { ...sample, year: 2026, saleWeek: 40 },
      { ...sample, year: 2026, saleWeek: 45 },
      { ...sample, year: 2026, saleWeek: 51 },
      { ...sample, year: 2027, saleWeek: 2 },
      { ...sample, year: 2027, saleWeek: 6 },
    ];
    expect(
      nearSaleCalendar(schedule, { year: 2026, week: 45 }).map((r) => [r.year, r.saleWeek]),
    ).toEqual([
      [2026, 45],
      [2026, 51],
      [2027, 2],
    ]);
  });
});
