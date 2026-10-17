import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createNewGame } from '../../src/engine/state/newGame';
import { generateHorse } from '../../src/engine/horse/generate';
import { mareQuality } from '../../src/engine/breeding/matingPlan';
import { createRng } from '../../src/engine/rng';
import type { GameState, Horse, HorseStatus, Mare } from '../../src/engine/types';
import { formatDateKo } from '../../src/engine/time/calendar';
import { displayName } from '../../src/engine/naming/register';
import { matingQualityGrade } from '../../src/ui/breeding/matingPlanView';
import { mareBreedingView } from '../../src/ui/horse/horseDetailView';
import { stableRows } from '../../src/ui/stable/stableView';
import StableScreen from '../../src/ui/stable/StableScreen';

function fixture(): GameState {
  return createNewGame({
    seed: 20261017,
    playerName: '구름 마주',
    silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' },
  });
}

function addHorse(state: GameState, status: HorseStatus, id: string = status, birthYear?: number): Horse {
  const horse = generateHorse(createRng(id), {
    id,
    name: `구름 ${id}`,
    birthYear: birthYear ?? state.date.year - 3,
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

function addMare(state: GameState, id: string, patch: Partial<Mare> = {}): Mare {
  const horse = addHorse(state, 'broodmare', id);
  const mare: Mare = {
    horseId: horse.id,
    coveredBy: null,
    coveredWeek: null,
    pregnant: false,
    dueWeek: null,
    foals: [],
    blackTypeProduce: 0,
    ...patch,
  };
  state.mares[horse.id] = mare;
  return mare;
}

describe('M7-D 번식 암말 표', () => {
  it('임신 중 암말 행에 임신 중과 출산 예정 날짜를 보인다', () => {
    const state = fixture();
    const due = { year: state.date.year + 1, week: 7 };
    addMare(state, 'mare-preg', { pregnant: true, dueWeek: due.year * 100 + due.week });
    const html = renderToStaticMarkup(createElement(StableScreen, { state, initialTab: 'mares' }));
    expect(html).toContain('임신 중');
    expect(html).toContain(formatDateKo(due));
    const row = stableRows(state, 'mares').find((r) => r.id === 'mare-preg')!;
    expect(row.breeding).toMatchObject({ statusKo: '임신 중', tone: 'good', dueKo: formatDateKo(due) });
  });

  it('번식 암말 탭에는 컨디션·최근 5전·OR·조교사 열이 없다', () => {
    const state = fixture();
    addMare(state, 'mare-a');
    const html = renderToStaticMarkup(createElement(StableScreen, { state, initialTab: 'mares' }));
    for (const cls of ['stable-col--condition', 'stable-col--form', 'stable-col--or', 'stable-col--trainer', 'stable-col--overall']) {
      expect(html).not.toContain(cls);
    }
    for (const label of ['>컨디션<', '>최근 5전<', '>OR<', '>조교사<']) {
      expect(html).not.toContain(label);
    }
    for (const label of ['번식 상태', '출산 예정', '교배 종마 / 계획', '최근 산자', '산자 블랙타입']) {
      expect(html).toContain(label);
    }
  });

  it('번식 상태 문구: 공태·교배 완료 대기·예약·임신 중', () => {
    const state = fixture();
    const sire = addHorse(state, 'stud', 'sire-a');
    const year = state.date.year;

    addMare(state, 'mare-empty');
    expect(mareBreedingView(state.mares['mare-empty']!, (id) => id).statusKo).toBe('공태');

    addMare(state, 'mare-covered', { coveredBy: sire.id, coveredWeek: year * 100 + 10 });
    const covered = mareBreedingView(state.mares['mare-covered']!, (id) => id);
    expect(covered).toMatchObject({ statusKo: '교배 완료 · 수태 확인 대기', tone: 'warn', dueKo: null });
    expect(covered.coveredKo).toBe(`이번 시즌 교배: ${sire.id}`);

    addMare(state, 'mare-booked', { bookedFor: { stallionId: sire.id, season: year + 1, feePaid: 0 } });
    const booked = mareBreedingView(state.mares['mare-booked']!, (id) => id);
    expect(booked.statusKo).toBe(`예약: ${sire.id}`);
    expect(booked.bookedKo).toBe(`${year + 1} 시즌 예약: ${sire.id}`);
    expect(booked.planKo).toBe(`${year + 1} 시즌 예약: ${sire.id}`);

    const empty = mareBreedingView(state.mares['mare-empty']!, (id) => id);
    expect(empty.planKo).toBe('계획 없음');
  });

  it('최근 산자는 최신순 두 마리까지 이름·나이·성적 한 줄로 보인다', () => {
    const state = fixture();
    const year = state.date.year;
    const f1 = addHorse(state, 'foal', 'foal-1', year - 1);
    const f2 = addHorse(state, 'foal', 'foal-2', year - 1);
    const f3 = addHorse(state, 'foal', 'foal-3', year - 1);
    f3.record = { ...f3.record, starts: 2, wins: 1 };
    addMare(state, 'mare-foals', { foals: [f1.id, f2.id, f3.id], blackTypeProduce: 3 });
    const row = stableRows(state, 'mares').find((r) => r.id === 'mare-foals')!;
    expect(row.foals.map((f) => f.name)).toEqual([displayName(state, f3), displayName(state, f2)]);
    expect(row.foals[0]).toMatchObject({ ageKo: '1세', recordKo: '2전 1승' });
    expect(row.foals[1]!.recordKo).toBe('출주 전');
    expect(row.blackType).toBe(3);

    const html = renderToStaticMarkup(createElement(StableScreen, { state, initialTab: 'mares' }));
    expect(html).toContain(`${displayName(state, f3)} · 1세 · 2전 1승`);
    expect(html).not.toContain(displayName(state, f1));
  });

  it('번식 암말 등급은 번식 화면 배합 계획과 같은 수준 등급을 쓴다', () => {
    const state = fixture();
    const mare = addMare(state, 'mare-grade', { blackTypeProduce: 2 });
    const row = stableRows(state, 'mares').find((r) => r.id === mare.horseId)!;
    expect(row.overall).toBe(matingQualityGrade(mareQuality(state, mare.horseId)));
  });

  it('육성마 탭: 컨디션 주의 칩 아래에 이유를 한 줄로 보인다', () => {
    const state = fixture();
    const foal = addHorse(state, 'foal', 'foal-cond');
    foal.condition.fatigue = 50;
    foal.condition.fitness = 80;
    foal.condition.injury = null;
    const html = renderToStaticMarkup(createElement(StableScreen, { state, initialTab: 'young' }));
    expect(html).toContain('<span class="stable-cond-reason" title="피로 쌓임">피로 쌓임</span>');
    const good = addHorse(state, 'yearling', 'yearling-good');
    good.condition.fatigue = 5;
    good.condition.fitness = 90;
    good.condition.injury = null;
    const rows = stableRows(state, 'young');
    expect(rows.find((r) => r.id === 'yearling-good')!.condition.tone).toBe('good');
  });
});
