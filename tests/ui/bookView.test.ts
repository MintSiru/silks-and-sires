import { beforeAll, describe, expect, it } from 'vitest';
import {
  getNamingData,
  getNicks,
  getPeopleData,
  getRaceTemplates,
  getRacecourses,
  getSalesData,
  getSeriesDefinitions,
  getStallionNames,
  getStallionRecords,
} from '../../src/engine/data/staticData';
import { bootstrapGame } from '../../src/engine/state/bootstrap';
import type { GameState, HorseId, Mare, Stallion } from '../../src/engine/types';
import {
  bookingWindowKo,
  bookStatusOf,
  mareBookingKo,
  myStudView,
  STUD_EMPTY_KO,
} from '../../src/ui/breeding/bookView';
import { feeKo } from '../../src/ui/game/text';

let base: GameState;

beforeAll(() => {
  const data = {
    nicks: getNicks(),
    naming: getNamingData(),
    ...getPeopleData(),
    templates: getRaceTemplates(),
    courses: getRacecourses(),
    sales: getSalesData(),
    series: getSeriesDefinitions(),
    stallionNames: getStallionNames(),
    stallionRecords: getStallionRecords(),
  };
  base = bootstrapGame(
    { seed: 20261011, playerName: '테스트', silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' } },
    data,
  );
}, 600_000);

/** 종마 하나를 고른다(horseId 오름차순 첫 번째). 전부 status 'stud' 인 현역 종마다. */
function pickStallion(state: GameState): Stallion {
  const sorted = Object.values(state.stallions).sort((a, b) =>
    a.horseId < b.horseId ? -1 : a.horseId > b.horseId ? 1 : 0,
  );
  const row = sorted[0];
  if (row === undefined) throw new Error('테스트 전제 위반: 종마가 없음');
  return row;
}

function nameOfIn(state: GameState) {
  return (id: HorseId): string => state.horses[id]?.name ?? id;
}

describe('북 현황 라벨', () => {
  // 새 게임은 시작 주에 AI 예약을 한 번 누적한다(bootstrap, 2026-10-15) — 1월이면 북이 이미 일부 찼다
  it('새 게임 1주차는 2026 시즌 라벨 형식이고 AI 예약이 이미 쌓여 있다', () => {
    expect(base.date.year).toBe(2026);
    const state = { ...base, date: { year: 2026, week: 1 } };
    const stallion = pickStallion(state);
    const status = bookStatusOf(state, stallion);
    expect(status.season).toBe(2026);
    expect(status.limit).toBe(stallion.bookLimit);
    expect(status.labelKo).toMatch(/^2026 시즌 북 \d+\/\d+$/);
    expect(status.booked).toBeGreaterThan(0);
    expect(status.booked).toBe(stallion.bookedThisSeason);
    expect(status.full).toBe(false);
  });

  it('44주로 옮기면 다음 시즌 2027 로 바뀌고 예약 0두다', () => {
    const state = { ...base, date: { year: 2026, week: 44 } };
    const stallion = pickStallion(state);
    const status = bookStatusOf(state, stallion);
    expect(status.season).toBe(2027);
    expect(status.booked).toBe(0);
    expect(status.labelKo).toBe(`2027 시즌 북 0/${stallion.bookLimit}`);
  });

  it('예약 집계 시즌이 현재 예약 시즌과 다르면 예약 수를 0으로 본다', () => {
    const state = { ...base, date: { year: 2026, week: 1 } };
    const stallion = pickStallion(state);
    const stale: Stallion = { ...stallion, bookingSeason: 2025, bookedThisSeason: stallion.bookLimit };
    const status = bookStatusOf(state, stale);
    expect(status.booked).toBe(0);
    expect(status.full).toBe(false);
  });

  it('예약 수가 상한에 닿으면 마감이다', () => {
    const state = { ...base, date: { year: 2026, week: 1 } };
    const stallion = pickStallion(state);
    const full: Stallion = { ...stallion, bookingSeason: 2026, bookedThisSeason: stallion.bookLimit };
    const status = bookStatusOf(state, full);
    expect(status.full).toBe(true);
    expect(status.labelKo).toBe('2026 시즌 북 마감');
  });

  it('예약 창이 닫히면 닫힘 라벨을 쓴다', () => {
    const state = { ...base, date: { year: 2026, week: 30 } };
    const status = bookStatusOf(state, pickStallion(state));
    expect(status.season).toBeNull();
    expect(status.labelKo).toBe('예약 창 닫힘(11월에 열림)');
  });
});

describe('예약 창 안내', () => {
  it('창이 열려 있으면 시즌을 알리고, 사전 예약이면 환불 문구를 덧붙인다', () => {
    const early = { ...base, date: { year: 2026, week: 1 } };
    expect(bookingWindowKo(early)).toBe(
      '지금 예약하면 2026 시즌 교배입니다 — 번식 시즌에 교배가 이루어지며, 교배하지 못하면 시즌 끝에 환불됩니다',
    );
    const late = { ...base, date: { year: 2026, week: 44 } };
    expect(bookingWindowKo(late)).toContain('2027 시즌 교배입니다');
  });

  it('창이 닫혀 있으면 11월 안내를 보인다', () => {
    const closed = { ...base, date: { year: 2026, week: 30 } };
    expect(bookingWindowKo(closed)).toBe('예약 창이 닫혀 있습니다. 11월 첫 주에 다음 시즌 예약이 열립니다.');
  });
});

describe('내 종마 화면', () => {
  it('플레이어 종마가 없으면 빈 목록과 안내 문구다', () => {
    const view = myStudView(base);
    expect(view.stallions).toEqual([]);
    expect(view.seasons).toEqual([]);
    expect(view.slotsKo).toBe(`종마사 0/${base.stud.slots}칸 사용`);
    expect(STUD_EMPTY_KO).toBe('아직 종마가 없습니다. 연말 정산에서 은퇴하는 수말을 종마로 세울 수 있습니다.');
  });

  it('플레이어 종마와 정산 기록을 넣으면 종마 행과 최신순 정산 행을 보인다', () => {
    const state = structuredClone(base);
    const stallion = pickStallion(state);
    const horse = state.horses[stallion.horseId];
    const owner = state.owners[state.playerOwnerId];
    if (horse === undefined || owner === undefined) throw new Error('테스트 전제 위반');
    horse.ownerId = state.playerOwnerId;
    horse.status = 'stud';
    owner.horseIds.push(horse.id);
    state.stud.seasons.push(
      { stallionId: horse.id, year: 2025, fee: stallion.fee, outsideCovers: 30, ownCovers: 1, conceptions: 18, income: 18 * stallion.fee },
      { stallionId: horse.id, year: 2026, fee: stallion.fee, outsideCovers: 40, ownCovers: 2, conceptions: 25, income: 25 * stallion.fee },
    );

    const view = myStudView(state);
    expect(view.slotsKo).toBe(`종마사 1/${state.stud.slots}칸 사용`);
    expect(view.stallions).toEqual([
      {
        horseId: horse.id,
        name: horse.name,
        feeKo: feeKo(stallion.fee),
        bookKo: bookStatusOf(state, stallion).labelKo,
        firstSeasonYear: stallion.firstSeasonYear,
      },
    ]);
    expect(view.seasons).toEqual([
      { year: 2026, name: horse.name, outsideCovers: 40, conceptions: 25, incomeKo: feeKo(25 * stallion.fee) },
      { year: 2025, name: horse.name, outsideCovers: 30, conceptions: 18, incomeKo: feeKo(18 * stallion.fee) },
    ]);
  });
});

describe('번식 암말 예약 표시', () => {
  const blankMare: Mare = {
    horseId: 'mare_test',
    coveredBy: null,
    coveredWeek: null,
    pregnant: false,
    dueWeek: null,
    foals: [],
    blackTypeProduce: 0,
  };

  it('사전 예약 중이면 종마와 시즌을 보이고, 예약이 없으면 null 이다', () => {
    const state = base;
    const stallion = pickStallion(state);
    const nameOf = nameOfIn(state);
    const booked: Mare = { ...blankMare, bookedFor: { stallionId: stallion.horseId, season: 2027 } };
    expect(mareBookingKo(booked, nameOf)).toBe(`${nameOf(stallion.horseId)} 사전 예약(2027 시즌)`);
    expect(mareBookingKo(blankMare, nameOf)).toBeNull();
    expect(mareBookingKo({ ...blankMare, bookedFor: null }, nameOf)).toBeNull();
  });
});
