import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createNewGame } from '../../src/engine/state/newGame';
import { generateHorse } from '../../src/engine/horse/generate';
import { assessForPlayer } from '../../src/engine/horse/playerView';
import { createRng } from '../../src/engine/rng';
import type { GameState, Horse, HorseStatus, RunnerResult, Trainer } from '../../src/engine/types';
import { getRaceTemplates } from '../../src/engine/data/staticData';
import { formatDateKo } from '../../src/engine/time/calendar';
import { WeightUnitProvider } from '../../src/ui/game/WeightUnitContext';
import type { GameApi } from '../../src/ui/game/useGame';
import { goingKo, conditionOf, formSummaryKo, horseRunRows, horseTimeline, overviewOf, recentRuns } from '../../src/ui/horse/horseDetailView';
import HorseDetail from '../../src/ui/horse/HorseDetail';
import { stableCount, stableRows } from '../../src/ui/stable/stableView';
import StableScreen from '../../src/ui/stable/StableScreen';

function fixture(): GameState {
  return createNewGame({
    seed: 20261017,
    playerName: '구름 마주',
    silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' },
  });
}

function addHorse(state: GameState, status: HorseStatus, id: string = status): Horse {
  const horse = generateHorse(createRng(id), {
    id,
    name: `구름 ${id}`,
    birthYear: state.date.year - 3,
    currentYear: state.date.year,
    sex: 'female',
    countryOfBirth: 'GB',
    status,
    level: 60,
  });
  horse.ownerId = state.playerOwnerId;
  state.horses[id] = horse;
  state.owners[state.playerOwnerId]!.horseIds.push(id);
  return horse;
}

/** 출주 결과 한 건. 해당 말을 position 착에 두고 나머지는 다른 말로 채운다. */
function addRun(state: GameState, horseId: string, week: number, position: number, fieldSize = 11) {
  const race = getRaceTemplates()[0]!;
  const runners: RunnerResult[] = Array.from({ length: fieldSize }, (_, i) => {
    const isHorse = i + 1 === position;
    return {
      runnerIndex: i,
      horseId: isHorse ? horseId : `rival-${week}-${i}`,
      saddleCloth: i + 1,
      draw: i + 1,
      jockeyId: 'unknown-jockey',
      weightLb: 126,
      position: i + 1,
      finishTime: 100 + i,
      margin: null,
      beatenLengths: i,
      sectionals: [],
      performanceFigure: 0,
      odds: null,
    };
  });
  state.raceResults.push({
    raceId: race.id,
    racecourseId: race.racecourseId,
    date: { year: state.date.year, week },
    going: 'good_to_firm',
    distance: race.distance,
    seed: week,
    winningTime: 100,
    sectionalMarks: [],
    runners,
  });
  return race;
}

describe('M6-U4 마구간 뷰', () => {
  it('다음 출주는 날짜·등급·거리와 레이스명으로 나뉘고 조건 목표는 등급 없이 남는다', () => {
    const state = fixture();
    const h = addHorse(state, 'in_training');
    const race = getRaceTemplates()[0]!;
    const week = { year: state.date.year, week: 8 };
    state.seasonState.racePlans = {
      [h.id]: [{ id: 'p1', date: week, templateId: race.id, target: null, status: 'approved', note: '' }],
    };
    const row = stableRows(state, 'active')[0]!;
    expect(row.nextRace).toMatchObject({
      dateLabel: formatDateKo(week),
      gradeText: race.grade ?? `클래스 ${race.raceClass}`,
      title: race.name,
      statusLabel: '승인됨',
    });
    expect(row.nextRace!.distanceText).toBe(`${race.distance.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}m`);

    state.seasonState.racePlans = {
      [h.id]: [
        {
          id: 'p2',
          date: week,
          templateId: null,
          target: { kinds: ['maiden'], minDistance: 1200, maxDistance: 1800 },
          status: 'approved',
          note: '',
        },
      ],
    };
    const target = stableRows(state, 'active')[0]!;
    expect(target.nextRace).toMatchObject({ gradeText: null, distanceText: null });
    expect(target.nextRace!.title).toContain('미승리');
  });

  it('최근 5전 띠는 최신순 착순을 주고, 번식 암말 표의 다음 칸에는 빈 값이 없다', () => {
    const state = fixture();
    const h = addHorse(state, 'in_training');
    addRun(state, h.id, 2, 9);
    addRun(state, h.id, 5, 2);
    addRun(state, h.id, 7, 1);
    expect(recentRuns(state, h.id, 5).map((r) => r.position)).toEqual([1, 2, 9]);
    expect(stableRows(state, 'active')[0]!.form.map((r) => r.position)).toEqual([1, 2, 9]);
    const mare = addHorse(state, 'broodmare');
    const mareRow = stableRows(state, 'mares').find((r) => r.id === mare.id)!;
    expect(mareRow.next).toBe('계획 없음');
    expect(mareRow.nextRace).toBeNull();
    expect(mareRow.form).toEqual([]);
  });

  it('종합 등급은 평가에서, 컨디션 칩은 부상·피로·컨디션 기준으로 나눈다', () => {
    const state = fixture();
    const h = addHorse(state, 'in_training');
    const row = stableRows(state, 'active')[0]!;
    expect(row.overall).toBe(assessForPlayer(state, h.id).conformation.overall);
    expect(['good', 'warn', 'danger']).toContain(row.condition.tone);

    h.condition.fitness = 90;
    h.condition.fatigue = 5;
    h.condition.injury = null;
    expect(conditionOf(h)).toMatchObject({ tone: 'good', label: '좋음', fitnessWord: '최상', fatigueWord: '없음', reasons: [] });

    h.condition.fatigue = 30;
    expect(conditionOf(h)).toMatchObject({ tone: 'good', label: '좋음', fatigueWord: '조금' });

    h.condition.fatigue = 50;
    expect(conditionOf(h)).toMatchObject({ tone: 'warn', label: '주의', fatigueWord: '많음' });
    expect(conditionOf(h).reasons).toContain('피로 쌓임');

    h.condition.fatigue = 70;
    expect(conditionOf(h)).toMatchObject({ tone: 'danger', label: '위험', fatigueWord: '많음' });
    expect(conditionOf(h).reasons).toContain('피로 많음');

    h.condition.fatigue = 5;
    h.condition.injury = { kind: 'tendon', since: state.date, weeksOut: 8, diagnosed: false };
    expect(conditionOf(h).tone).toBe('danger');
    expect(conditionOf(h).reasons).toContain('부상 중');
  });

  it('확인 열은 경고가 있는 말이 있을 때만 그린다', () => {
    const state = fixture();
    const h = addHorse(state, 'in_training');
    /* 평가에 필요한 최소 조교사(상마안만) — 실제 조교사 생성 없이 확인 열 규칙만 본다 */
    state.trainers['trainer-test'] = { id: 'trainer-test', name: '가상 조교사', eye: 50 } as unknown as Trainer;
    h.trainerId = 'trainer-test';
    expect(stableRows(state, 'active')[0]!.warnings).toEqual([]);
    expect(renderToStaticMarkup(createElement(StableScreen, { state }))).not.toContain('stable-col--warn');
    h.trainerId = null;
    expect(stableRows(state, 'active')[0]!.warnings).toContain('조교사 미배정');
    const html = renderToStaticMarkup(createElement(StableScreen, { state }));
    expect(html).toContain('stable-col--warn');
    expect(html).toContain('>확인<');
    expect(html).toContain('stable-tabs-row');
  });

  it('검색어는 말 이름으로 걸러지고, 탭 두수는 목록 길이와 같다', () => {
    const state = fixture();
    addHorse(state, 'in_training');
    addHorse(state, 'resting');
    expect(stableCount(state, 'active')).toBe(stableRows(state, 'active').length);
    expect(stableRows(state, 'active', '구름 resting')).toHaveLength(1);
  });

  it('마구간 표는 새 열과 검색 placeholder 를 그린다(검색 라벨 글자는 없다)', () => {
    const state = fixture();
    const h = addHorse(state, 'in_training');
    addRun(state, h.id, 3, 2);
    const html = renderToStaticMarkup(createElement(StableScreen, { state }));
    for (const label of ['종합', '컨디션', '최근 5전', '다음 출주']) expect(html).toContain(label);
    expect(html).toContain('placeholder="말 이름 검색"');
    expect(html).toContain('aria-label="말 이름 검색"');
    expect(html).toContain('form-band__item--high');
    expect(html).not.toContain('>이름 검색<');
  });
});

describe('M6-U4 말 상세 뷰', () => {
  it('마장은 한국어로 바꾸고 원문은 따로 둔다', () => {
    expect(goingKo('good_to_firm')).toBe('약간 단단함');
    const state = fixture();
    const h = addHorse(state, 'in_training');
    addRun(state, h.id, 4, 5);
    const row = horseRunRows(state, h.id)[0]!;
    expect(row.goingTitle).toBe('GOOD TO FIRM');
    expect(row.going).toBe('약간 단단함');
    expect(row.distance).toMatch(/^[\d,]+m \(/);
    expect(row).toMatchObject({ position: 5, fieldSize: 11, placing: '5/11' });
    expect(row.gradeBadge).not.toBeNull();
  });

  it('자동 편성 레이스는 등급 배지를 숨기고 상금은 €0 으로 적는다(— 대신)', () => {
    const state = fixture();
    const h = addHorse(state, 'in_training');
    addRun(state, h.id, 4, 5);
    const autoRaceId = 'auto-race-not-in-templates';
    state.raceResults = state.raceResults.map((r) => ({ ...r, raceId: autoRaceId }));
    const row = horseRunRows(state, h.id)[0]!;
    expect(row.gradeBadge).toBeNull();
    expect(row.name).toBe('자동 편성 레이스');
    expect(row.prize).toBe('€0');
  });

  it('전적 요약은 1착과 1~3착 횟수를 나눠 센다', () => {
    const state = fixture();
    const h = addHorse(state, 'in_training');
    addRun(state, h.id, 2, 1);
    addRun(state, h.id, 3, 3);
    addRun(state, h.id, 4, 7);
    expect(formSummaryKo(recentRuns(state, h.id))).toBe('최근 3전 1착 1회 · 1~3착 2회');
    expect(formSummaryKo([])).toBe('최근 출주 기록이 없습니다.');
  });

  it('개요는 해설 첫 문장을 총평으로, 나머지는 불릿으로 나눈다', () => {
    const state = fixture();
    const h = addHorse(state, 'in_training');
    const view = overviewOf(assessForPlayer(state, h.id));
    expect(['S', 'A', 'B', 'C', 'D', 'E']).toContain(view.grade);
    expect(view.details.map((d) => d.key)).toEqual(['frame', 'hindquarters', 'legs', 'action', 'temperament']);
    expect(view.distanceKo).toContain('m');
    if (view.lead !== null) expect(view.lead.length).toBeGreaterThan(0);
  });

  it('기록 타임라인은 최신 주가 위, 출주는 착순과 경주명, 운영 로그는 따로 모은다', () => {
    const state = fixture();
    const h = addHorse(state, 'in_training');
    const race = addRun(state, h.id, 20, 5);
    const year = state.date.year;
    state.eventLog = [
      { type: 'horse_named', horseId: h.id, name: '구름 이름', auto: false, date: { year, week: 30 } },
      { type: 'horse_status_changed', horseId: h.id, from: 'foal', to: 'yearling', date: { year, week: 5 } },
      { type: 'race_run', raceId: race.id, meetingId: 'meet', date: { year, week: 20 }, winnerId: 'rival', playerHorseIds: [h.id] },
      { type: 'race_plan_declared', horseId: h.id, raceId: race.id, date: { year, week: 31 } },
    ];
    state.chronicle = [
      { id: `${year}-1`, kind: 'first_win', date: { year, week: 12 }, horseId: h.id, player: true },
    ];
    const timeline = horseTimeline(state, h.id, (id) => id);
    expect(timeline.items.map((i) => i.dateLabel)).toEqual([
      formatDateKo({ year, week: 30 }),
      formatDateKo({ year, week: 20 }),
      formatDateKo({ year, week: 12 }),
      formatDateKo({ year, week: 5 }),
    ]);
    expect(timeline.items.find((i) => i.kind === 'race')!.race).toEqual({
      position: 5,
      fieldSize: 11,
      raceName: race.name,
      gradeBadge: race.grade ?? `클래스 ${race.raceClass}`,
    });
    expect(timeline.items.find((i) => i.kind === 'milestone')!.text).toBeTruthy();
    expect(timeline.ops.map((i) => i.event?.type)).toEqual(['race_plan_declared']);
  });

  it('말 상세 개요·전적·기록 탭이 새 문구와 배지를 그린다', () => {
    const state = fixture();
    const h = addHorse(state, 'in_training');
    const race = addRun(state, h.id, 6, 5);
    state.eventLog = [
      { type: 'race_run', raceId: race.id, meetingId: 'meet', date: { year: state.date.year, week: 6 }, winnerId: 'rival', playerHorseIds: [h.id] },
      { type: 'race_plan_declared', horseId: h.id, raceId: race.id, date: { year: state.date.year, week: 7 } },
    ];
    const game = { state } as GameApi;
    const render = (initialTab: 'overview' | 'record' | 'events') =>
      renderToStaticMarkup(
        createElement(WeightUnitProvider, {
          children: createElement(HorseDetail, { game, horseId: h.id, initialTab, onClose() {}, onBreeding() {} }),
        }),
      );
    const overview = render('overview');
    expect(overview).toContain('overview-lead');
    expect(overview).toContain('적성 거리');
    expect(overview).toContain('class="grade-chips"');
    expect(overview).toContain('체격');
    expect(overview).toContain('>변경<');
    expect(overview).not.toContain('조교사 맡기기');

    const record = render('record');
    expect(record).toContain('최근 1전 1착 0회 · 1~3착 0회');
    expect(record).toContain('5착/11');
    expect(record).toContain('title="GOOD TO FIRM"');
    expect(record).toContain('자세히');
    expect(record).toContain('record-more-btn');
    expect(record).not.toContain('<dt>기수</dt>');

    const events = render('events');
    expect(events).toContain('legacy-timeline horse-timeline');
    expect(events).toContain('5착/11');
    expect(events).toContain('운영 로그 1건');
    expect(events).toContain('<details class="ops-log">');
  });
});
