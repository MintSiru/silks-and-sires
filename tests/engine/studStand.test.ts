import { describe, expect, it } from 'vitest';
import { bookCovering, createBreedingSystem } from '../../src/engine/breeding/season';
import { STUD_BASE_SLOTS } from '../../src/engine/config/stud';
import { getNamingData, getNicks, getStallionNames, getStallionRecords } from '../../src/engine/data/staticData';
import { createRng } from '../../src/engine/rng';
import { createNewGame } from '../../src/engine/state/newGame';
import { bootstrapWorld } from '../../src/engine/state/world';
import { canStandAtStud, freeStudSlots, standPlayerStallion } from '../../src/engine/stud/stand';
import { estimateStudFee, peakOfficialRating, roundStudFee } from '../../src/engine/stud/value';
import { meanAbility, ratingFromAbility } from '../../src/engine/world/rating';

const data = {
  stallionRecords: getStallionRecords(), stallionNames: getStallionNames(),
  nicks: getNicks(), naming: getNamingData(),
};

function fixture() {
  const state = bootstrapWorld(createNewGame({
    seed: 42, playerName: 'Test Owner',
    silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' },
  }), data, createRng(42));
  state.stud = { slots: STUD_BASE_SLOTS, seasons: [] };
  const mare = Object.values(state.horses).find(
    (h) => h.ownerId === state.playerOwnerId && h.status === 'broodmare',
  )!;
  const sire = Object.values(state.stallions)[0]!;
  const horse = structuredClone(mare);
  horse.id = 'test-colt';
  horse.sex = 'male';
  horse.gelded = false;
  horse.birthYear = 2023;
  horse.status = 'in_training';
  horse.trainerId = 'test-trainer';
  horse.officialRating = 120;
  horse.record.groupWins = 2;
  horse.sireId = sire.horseId;
  horse.sireLineId = sire.sireLineId;
  state.horses[horse.id] = horse;
  state.owners[state.playerOwnerId]!.horseIds.push(horse.id);
  sire.fee = 30_000;
  for (const stallion of Object.values(state.stallions)) stallion.popularity = 50;
  return { state, horse, mare, sire };
}

describe('종부료 추정', () => {
  it('최고 OR·그룹·혈통·유행을 적용하고 순수하며 결정적이다', () => {
    const { state, horse } = fixture();
    horse.officialRating = 100;
    state.seasonState.ratingHistory[horse.id] = [
      { from: null, to: 120, raceId: 'test-race', date: { year: 2025, week: 20 } },
    ];
    const before = structuredClone(state);
    expect(peakOfficialRating(state, horse.id)).toBe(120);
    const estimate = estimateStudFee(state, horse.id);
    expect(estimate).toEqual({ fee: 29_000, base: 25_000, groupMult: 1.16, pedigreeMult: 1, trendMult: 1 });
    expect(estimateStudFee(state, horse.id)).toEqual(estimate);
    expect(state).toEqual(before);
    horse.officialRating = 125;
    expect(peakOfficialRating(state, horse.id)).toBe(125);
  });

  it('OR 90~135에서 단조 증가하고 사다리를 따른다', () => {
    const { state, horse } = fixture();
    let previous = 0;
    for (let rating = 90; rating <= 135; rating += 5) {
      horse.officialRating = rating;
      const { fee } = estimateStudFee(state, horse.id);
      expect(fee).toBeGreaterThanOrEqual(previous);
      expect(fee % (fee < 10_000 ? 500 : 1_000)).toBe(0);
      previous = fee;
    }
    expect(roundStudFee(9_749)).toBe(9_500);
    expect(roundStudFee(10_500)).toBe(11_000);
  });

  it('OR 부재 시 능력, 부 부재 시 중립 배수와 OR 양끝 가격을 쓴다', () => {
    const { state, horse } = fixture();
    horse.officialRating = null;
    horse.sireId = null;
    horse.sireLineId = null;
    horse.record.groupWins = 0;
    expect(peakOfficialRating(state, horse.id)).toBeNull();
    const estimated = estimateStudFee(state, horse.id);
    horse.officialRating = ratingFromAbility(meanAbility(horse.ability));
    expect(estimateStudFee(state, horse.id)).toEqual(estimated);
    horse.officialRating = 89;
    expect(estimateStudFee(state, horse.id)).toMatchObject({ fee: 1_500, pedigreeMult: 1, trendMult: 1 });
    horse.officialRating = 135;
    expect(estimateStudFee(state, horse.id).base).toBe(60_000);
  });

  it('혈통·그룹 배수 상한과 현역 부계 인기만 반영한다', () => {
    const { state, horse, sire } = fixture();
    horse.record.groupWins = 100;
    sire.fee = 1_000_000;
    horse.sireLineId = 'test-line';
    sire.sireLineId = 'test-line';
    sire.popularity = 100;
    state.horses[sire.horseId]!.status = 'stud';
    expect(estimateStudFee(state, horse.id)).toMatchObject({ groupMult: 1.4, pedigreeMult: 1.4, trendMult: 1.15 });
    sire.fee = 0;
    state.horses[sire.horseId]!.status = 'retired';
    expect(estimateStudFee(state, horse.id)).toMatchObject({ pedigreeMult: 0.7, trendMult: 1 });
  });
});

describe('목장 계류', () => {
  it('여섯 오류와 검사 순서를 반환하고 오류 시 상태를 보존한다', () => {
    const { state, horse } = fixture();
    expect(canStandAtStud(state, 'missing', 2026)).toBe('not_found');
    horse.ownerId = null;
    expect(canStandAtStud(state, horse.id, 2026)).toBe('not_player_horse');
    horse.ownerId = state.playerOwnerId;
    horse.sex = 'female';
    expect(canStandAtStud(state, horse.id, 2026)).toBe('not_entire_colt');
    horse.sex = 'male';
    horse.gelded = true;
    expect(canStandAtStud(state, horse.id, 2026)).toBe('not_entire_colt');
    horse.gelded = false;
    expect(canStandAtStud(state, horse.id, 2025)).toBe('too_young');
    horse.status = 'retired';
    expect(canStandAtStud(state, horse.id, 2026)).toBe('not_racing');
    horse.status = 'resting';
    expect(canStandAtStud(state, horse.id, 2026)).toBeNull();
    state.stud.slots = 0;
    expect(canStandAtStud(state, horse.id, 2026)).toBe('no_free_slot');
    const before = structuredClone(state);
    expect(() => standPlayerStallion(state, horse.id, 2026)).toThrow('no_free_slot');
    expect(state).toEqual(before);
  });

  it('레코드·이벤트·독립 수태율을 만들고 한 칸을 점유한다', () => {
    const { state, horse } = fixture();
    const second = { ...structuredClone(horse), id: 'test-second' };
    state.horses[second.id] = second;
    const copy = structuredClone(state);
    const rngBefore = structuredClone(state.rng);
    expect(freeStudSlots(state)).toBe(1);
    const events = standPlayerStallion(state, horse.id, 2026);
    expect(standPlayerStallion(copy, horse.id, 2026)).toEqual(events);
    expect(state).toEqual(copy);
    expect(state.rng).toEqual(rngBefore);
    expect(horse).toMatchObject({ status: 'stud', trainerId: null });
    expect(state.stallions[horse.id]).toMatchObject({
      realKey: null, firstSeasonYear: 2026, fee: 29_000,
      bookLimit: 110, bookedThisSeason: 0,
      standsIn: state.owners[state.playerOwnerId]!.country,
    });
    expect(state.stallions[horse.id]!.fertility).toBeGreaterThanOrEqual(0.5);
    expect(state.stallions[horse.id]!.fertility).toBeLessThanOrEqual(0.99);
    expect(events).toEqual([{ type: 'horse_status_changed', horseId: horse.id,
      from: 'in_training', to: 'stud', date: { year: 2026, week: 1 } }]);
    expect(canStandAtStud(state, second.id, 2026)).toBe('no_free_slot');
    state.stud.slots = 0;
    expect(freeStudSlots(state)).toBe(0);
  });

  it('부계는 부 종마에서 찾고 없으면 기본 계통을 쓴다', () => {
    const { state, horse, sire } = fixture();
    horse.sireLineId = null;
    standPlayerStallion(state, horse.id, 2026);
    expect(state.stallions[horse.id]!.sireLineId).toBe(sire.sireLineId);
    const other = fixture();
    other.horse.sireLineId = null;
    other.horse.sireId = null;
    standPlayerStallion(other.state, other.horse.id, 2026);
    expect(other.state.stallions[other.horse.id]!.sireLineId).toBe('sl_phalaris');
  });
});

it('자기 종마는 자금이 없어도 무료 예약하고 불수태 환불도 기록하지 않는다', () => {
  const { state, horse, mare } = fixture();
  standPlayerStallion(state, horse.id, 2026);
  state.date = { year: 2026, week: 10 };
  state.owners[state.playerOwnerId]!.funds = 0;
  state.stallions[horse.id]!.fertility = 0;
  const before = structuredClone(state.economy);
  const result = bookCovering(state, state.playerOwnerId, mare.id, horse.id);
  if (!result.ok) throw new Error(result.error);
  expect(result.events[0]).toMatchObject({ type: 'covering_booked', fee: 0 });
  expect(result.state.owners[state.playerOwnerId]!.funds).toBe(0);
  expect(result.state.economy).toEqual(before);
  const date = { year: 2026, week: 11 };
  result.state.date = date;
  const events = createBreedingSystem(data).run(result.state, { date, rng: createRng(42) });
  expect(events).toContainEqual({ type: 'conception', mareId: mare.id, stallionId: horse.id, success: false, date });
  expect(result.state.economy).toEqual(before);
  expect(result.state.owners[state.playerOwnerId]!.funds).toBe(0);
  expect(result.state.mares[mare.id]!.coveredBy).toBeNull();
  expect(result.state.stallions[horse.id]!.bookedThisSeason).toBe(0);
});
