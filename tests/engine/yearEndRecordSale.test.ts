import { describe, expect, it } from 'vitest';
import * as config from '../../src/engine/config/stud';
import { getNamingData, getNicks, getStallionNames, getStallionRecords } from '../../src/engine/data/staticData';
import { createRng } from '../../src/engine/rng';
import { createNewGame } from '../../src/engine/state/newGame';
import { bootstrapWorld } from '../../src/engine/state/world';
import { standPlayerStallion } from '../../src/engine/stud/stand';
import { salePriceQuote, saleRecordMult, stallionSalePrice } from '../../src/engine/stud/trade';
import { estimateStudFee, stallionRecordSaleMult } from '../../src/engine/stud/value';
import { submitYearEnd, yearEndCandidates, yearEndPending } from '../../src/engine/stud/yearEnd';
import type { CareerRecord, GameState, YearEndChoice, YearEndSubmission } from '../../src/engine/types';

const base = bootstrapWorld(createNewGame({ seed: 42, playerName: '가상 마주',
  silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' } }), {
  stallionRecords: getStallionRecords(), stallionNames: getStallionNames(),
  nicks: getNicks(), naming: getNamingData(),
}, createRng(42));

const ZERO_RECORD: CareerRecord = { starts: 0, wins: 0, seconds: 0, thirds: 0, earnings: 0,
  blackTypePlacings: 0, groupWins: 0 };

/** 연말 정산 대기 상태에서 4세 수말 한 두(현역)를 만든다. 성적은 주어진 값으로 덮는다. */
function colt(record: Partial<CareerRecord>): { state: GameState; horseId: string } {
  const state = structuredClone(base);
  const template = Object.values(state.horses)[0]!;
  state.date = { year: state.date.year + 1, week: 1 };
  const horseId = 'test-record-colt';
  state.horses[horseId] = { ...structuredClone(template), id: horseId, sex: 'male', gelded: false,
    status: 'in_training', ownerId: state.playerOwnerId, birthYear: state.date.year - 4,
    trainerId: 'test-trainer', record: { ...ZERO_RECORD, starts: 1, ...record } };
  state.owners[state.playerOwnerId]!.horseIds.push(horseId);
  return { state, horseId };
}

/** 후보 전원을 추천값으로 제출하되, 대상 말만 주어진 진로로 바꾼다 */
function submissionFor(state: GameState, horseId: string, choice: YearEndChoice, nominations = 0): YearEndSubmission {
  return { year: state.date.year,
    horses: yearEndCandidates(state).map((c) => c.horseId === horseId
      ? { horseId, choice, nominations }
      : { horseId: c.horseId, choice: c.recommended }),
    retainers: [] };
}

describe('미승리마 종마 진로 제한(M7-C1)', () => {
  it('통산 무승 4세 수말은 종마·국내 판매·해외 판매를 고를 수 없고 현역 속행·거세·은퇴만 허용된다', () => {
    const { state, horseId } = colt({ wins: 0 });
    expect(yearEndPending(state)).toBe(true);
    const candidate = yearEndCandidates(state).find((c) => c.horseId === horseId)!;
    expect(candidate.allowed).not.toContain('stud');
    expect(candidate.allowed).not.toContain('sell_domestic');
    expect(candidate.allowed).not.toContain('sell_overseas');
    expect(candidate.allowed).toEqual(expect.arrayContaining(['continue', 'geld', 'retire']));
    expect(candidate.studFeeEstimate).toBeNull();
    expect(candidate.salePrice).toBeNull();
  });

  it.each(['stud', 'sell_domestic', 'sell_overseas'] as const)(
    '통산 무승 수말이 %s 를 제출하면 choice_not_allowed 로 거절하고 입력을 보존한다',
    (choice) => {
      const { state, horseId } = colt({ wins: 0 });
      const before = structuredClone(state);
      const result = submitYearEnd(state, submissionFor(state, horseId, choice));
      expect(result).toEqual({ ok: false, error: 'choice_not_allowed', horseId });
      expect(state).toEqual(before);
    });

  it('통산 1승 수말은 종마 진로가 열린다', () => {
    const { state, horseId } = colt({ wins: 1 });
    const candidate = yearEndCandidates(state).find((c) => c.horseId === horseId)!;
    expect(candidate.allowed).toEqual(expect.arrayContaining(['stud', 'sell_domestic', 'sell_overseas']));
  });
});

describe('종마 후보 판매가의 성적 배율(M7-C1)', () => {
  it('배율 단계: 그룹 우승 1.0, 리스티드·그룹 1~3착 0.45, 1승 0.2, 무승 0', () => {
    expect(stallionRecordSaleMult({ ...ZERO_RECORD, wins: 1, groupWins: 1, blackTypePlacings: 1 }))
      .toBe(config.STALLION_SALE_RECORD_MULT.g1Win);
    expect(stallionRecordSaleMult({ ...ZERO_RECORD, wins: 1, blackTypePlacings: 1 }))
      .toBe(config.STALLION_SALE_RECORD_MULT.blackType);
    expect(stallionRecordSaleMult({ ...ZERO_RECORD, blackTypePlacings: 1 }))
      .toBe(config.STALLION_SALE_RECORD_MULT.blackType);
    expect(stallionRecordSaleMult({ ...ZERO_RECORD, wins: 1 })).toBe(config.STALLION_SALE_RECORD_MULT.winner);
    expect(stallionRecordSaleMult(ZERO_RECORD)).toBe(config.STALLION_SALE_NO_RECORD_MULT);
    expect(config.STALLION_SALE_RECORD_MULT).toEqual({ g1Win: 1.0, groupWin: 0.7, blackType: 0.45, winner: 0.2 });
    expect(config.STUD_MIN_WINS).toBe(1);
  });

  it('1승(블랙타입 없음) 수말 판매가는 기존 값에 0.2를 곱한 뒤 천 유로 단위로 반올림한다', () => {
    const { state, horseId } = colt({ wins: 1 });
    const fee = estimateStudFee(state, horseId).fee;
    const age = state.date.year - state.horses[horseId]!.birthYear;
    expect(age).toBe(4);
    const gross = fee * config.STALLION_SALE_FEE_MULT;
    const quote = salePriceQuote(state, horseId)!;
    expect(quote.domestic).toBe(Math.round(gross * 0.2 / 1000) * 1000);
    expect(quote.overseas).toBe(Math.round(gross * config.STALLION_SALE_OVERSEAS_MULT * 0.2 / 1000) * 1000);
    expect(quote.nominationCost).toBeCloseTo(fee * config.NOMINATION_PRICE_FEE_MULT * 0.2, 6);
    const candidate = yearEndCandidates(state).find((c) => c.horseId === horseId)!;
    expect(candidate.salePrice).toEqual({ domestic: quote.domestic, overseas: quote.overseas });
  });

  it('G1·그룹 우승마 판매가는 기존 값과 같다(배율 1.0)', () => {
    const { state, horseId } = colt({ wins: 1, groupWins: 1, blackTypePlacings: 1 });
    const fee = estimateStudFee(state, horseId).fee;
    expect(saleRecordMult(state.horses[horseId]!)).toBe(1);
    expect(salePriceQuote(state, horseId)!.domestic).toBe(stallionSalePrice(fee, 4, 'domestic', 0));
    expect(salePriceQuote(state, horseId)!.domestic)
      .toBe(Math.round(fee * config.STALLION_SALE_FEE_MULT / 1000) * 1000);
  });

  it('리스티드·그룹 1~3착 수말 판매가는 0.45를 곱한다', () => {
    const { state, horseId } = colt({ wins: 1, blackTypePlacings: 1 });
    const fee = estimateStudFee(state, horseId).fee;
    expect(salePriceQuote(state, horseId)!.domestic)
      .toBe(Math.round(fee * config.STALLION_SALE_FEE_MULT * 0.45 / 1000) * 1000);
  });

  it('판매를 실행하면 기록되는 판매가도 같은 배율을 쓴다(1승 수말, 교배권 1장)', () => {
    const { state, horseId } = colt({ wins: 1 });
    const fee = estimateStudFee(state, horseId).fee;
    const result = submitYearEnd(state, submissionFor(state, horseId, 'sell_domestic', 1));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.stud.sales.at(-1)).toMatchObject({ stallionId: horseId,
      price: stallionSalePrice(fee, 4, 'domestic', 1, config.STALLION_SALE_RECORD_MULT.winner) });
  });

  it('이미 종마인 말의 판매가는 성적 배율을 받지 않는다', () => {
    const { state, horseId } = colt({ wins: 1 });
    standPlayerStallion(state, horseId, state.date.year);
    const stallion = state.stallions[horseId]!;
    stallion.fee = 20_000;
    expect(saleRecordMult(state.horses[horseId]!)).toBe(1);
    expect(salePriceQuote(state, horseId)!.domestic).toBe(stallionSalePrice(20_000, 4, 'domestic', 0));
  });
});
