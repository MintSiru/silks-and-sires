import { beforeAll, describe, expect, it } from 'vitest';
import { PRIVATE_ENQUIRY_PER_WEEK } from '../../src/engine/config/sales';
import { enquirePrivatePurchase } from '../../src/engine/sales/privateMarket';
import { bootstrapGame, type BootstrapData } from '../../src/engine/state/bootstrap';
import type { GameState, Horse, PrivateOffer } from '../../src/engine/types';
import {
  getNamingData,
  getNicks,
  getPeopleData,
  getRaceTemplates,
  getRacecourses,
  getSeriesDefinitions,
  getStallionNames,
  getStallionRecords,
} from '../../src/engine/data/staticData';
import { enquiryAvailable } from '../../src/ui/horse/horseDetailView';
import { enquiryErrorKo } from '../../src/ui/game/text';
import {
  enquiryNoticeKo,
  mareOffspringKo,
  nextMarketWeeks,
  privateMarketEmptyKo,
  privateMarketRows,
  purchaseConfirmView,
} from '../../src/ui/sales/privateMarketView';

const BOOT_DATA: BootstrapData = {
  stallionRecords: getStallionRecords(),
  stallionNames: getStallionNames(),
  nicks: getNicks(),
  naming: getNamingData(),
  ...getPeopleData(),
  courses: getRacecourses(),
  templates: getRaceTemplates(),
  series: getSeriesDefinitions(),
};

let base: GameState;
beforeAll(() => {
  base = bootstrapGame(
    { seed: 20261017, playerName: '가상 마주', silks: { primary: '#123456', secondary: '#ffffff', pattern: 'hoops' } },
    BOOT_DATA,
  );
}, 600_000);

/** AI 마주가 가진 말 하나(플레이어 말 아님) */
function aiHorse(state: GameState): Horse {
  const horse = Object.values(state.horses).find(
    (h) => h.ownerId !== null && h.ownerId !== state.playerOwnerId && state.owners[h.ownerId]?.isPlayer === false,
  );
  if (horse === undefined) throw new Error('테스트 말 없음');
  return horse;
}

/** 출주 선언이 없는 AI 현역마 한 두(문의 대상으로 쓴다) */
function freeRacehorse(state: GameState): Horse {
  const declared = new Set(
    state.seasonState.meetings.flatMap((m) => m.races.flatMap((r) => r.declarations.map((d) => d.horseId))),
  );
  const horse = Object.values(state.horses).find(
    (h) =>
      h.ownerId !== null &&
      h.ownerId !== state.playerOwnerId &&
      state.owners[h.ownerId]?.isPlayer === false &&
      !declared.has(h.id),
  );
  if (horse === undefined) throw new Error('테스트 말 없음');
  return horse;
}

/** 현역 4세 AI 말(OR 90)로 맞춘 상태 */
function racehorseState(): { state: GameState; horse: Horse } {
  const state = structuredClone(base);
  state.date = { year: 2026, week: 5 };
  state.sales.privateOffers = [];
  const horse = freeRacehorse(state);
  horse.status = 'in_training';
  horse.birthYear = 2022;
  horse.sex = 'male';
  horse.gelded = false;
  horse.officialRating = 90;
  horse.name = '은빛 새벽';
  return { state, horse };
}

function offerFor(state: GameState, horse: Horse, source: PrivateOffer['source'], price: number): PrivateOffer {
  if (horse.ownerId === null) throw new Error('마주 없음');
  return {
    id: `po_test_${source ?? 'relation'}`,
    horseId: horse.id,
    ownerId: horse.ownerId,
    price,
    createdYear: state.date.year,
    createdWeek: state.date.week,
    expiresYear: state.date.year,
    expiresWeek: state.date.week + 4,
    source,
  };
}

describe('개인 거래 목록 행', () => {
  it('출처 배지·말 줄·OR 구간·최근 성적·추정 범위·호가·만료를 채운다', () => {
    const { state, horse } = racehorseState();
    state.owners[horse.ownerId!]!.name = '가상 마주 하나';
    state.sales.privateOffers = [offerFor(state, horse, 'enquiry', 300_000)];
    state.owners[state.playerOwnerId]!.funds = 1_000_000;

    const rows = privateMarketRows(state);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      offerId: 'po_test_enquiry',
      horseId: horse.id,
      horseName: '은빛 새벽',
      sourceKo: '문의',
      sourceClass: 'badge badge--grade-mid',
      kindKo: '현역',
      horseSubKo: '수 4세 · 현역',
      ownerName: '가상 마주 하나',
      orKo: '90~95',
      formKo: '최근 출주 기록 없음',
      priceKo: '€300,000',
      kind: 'racehorse',
    });
    expect(rows[0]?.estimateKo).toMatch(/^€[\d,]+ ~ €[\d,]+$/);
    expect(rows[0]?.expiresKo).toMatch(/^2026년 \d+월 \d주까지$/);
    // 평가 원값은 화면 행에 들어가지 않는다
    expect(JSON.stringify(rows)).not.toContain('valuation');
  });

  it('출처별 배지 문구: 시장·문의·관계', () => {
    const { state, horse } = racehorseState();
    const sources: PrivateOffer['source'][] = ['market', 'enquiry', undefined];
    const labels = sources.map((source) => {
      state.sales.privateOffers = [offerFor(state, horse, source, 100_000)];
      return privateMarketRows(state)[0]?.sourceKo;
    });
    expect(labels).toEqual(['시장', '문의', '관계']);
  });

  it('2세 유망주는 출주 전, 번식 암말은 산자 성적을 보인다', () => {
    const { state, horse } = racehorseState();
    horse.birthYear = 2024;
    state.sales.privateOffers = [offerFor(state, horse, 'relation', 50_000)];
    expect(privateMarketRows(state)[0]).toMatchObject({ kind: 'two_year_old', formKo: '출주 전', orKo: expect.any(String) });

    const mare = Object.values(state.horses).find((h) => h.id !== horse.id && h.ownerId !== null && h.ownerId !== state.playerOwnerId)!;
    const foal = Object.values(state.horses).find((h) => h.id !== horse.id && h.id !== mare.id)!;
    mare.status = 'broodmare';
    mare.sex = 'female';
    mare.birthYear = 2016;
    foal.record = { ...foal.record, starts: 3, wins: 1 };
    state.mares[mare.id] = {
      horseId: mare.id,
      coveredBy: null,
      coveredWeek: null,
      pregnant: false,
      dueWeek: null,
      foals: [foal.id],
      blackTypeProduce: 2,
    };
    state.sales.privateOffers = [offerFor(state, mare, 'market', 800_000)];
    expect(privateMarketRows(state)[0]).toMatchObject({ kind: 'broodmare', kindKo: '번식 암말', sourceKo: '시장' });
    expect(privateMarketRows(state)[0]?.formKo).toBe('산자 1두 · 출주 1두 · 승리 1두 · 블랙타입 2회');
    expect(mareOffspringKo(state, mare.id)).toBe('산자 1두 · 출주 1두 · 승리 1두 · 블랙타입 2회');
  });

  it('산자가 없는 암말은 산자 없음', () => {
    const { state, horse } = racehorseState();
    horse.status = 'broodmare';
    horse.sex = 'female';
    state.mares[horse.id] = {
      horseId: horse.id,
      coveredBy: null,
      coveredWeek: null,
      pregnant: false,
      dueWeek: null,
      foals: [],
      blackTypeProduce: 0,
    };
    expect(mareOffspringKo(state, horse.id)).toBe('산자 없음');
  });
});

describe('개인 거래 빈 상태 문구', () => {
  it('다음 매물 주까지 남은 주 수를 보인다(주 번호가 4의 배수인 주)', () => {
    expect(nextMarketWeeks({ year: 2026, week: 1 })).toBe(3);
    expect(nextMarketWeeks({ year: 2026, week: 4 })).toBe(4);
    expect(nextMarketWeeks({ year: 2026, week: 5 })).toBe(3);
    expect(nextMarketWeeks({ year: 2026, week: 49 })).toBe(3);
    expect(nextMarketWeeks({ year: 2026, week: 52 })).toBe(4);
    expect(privateMarketEmptyKo({ year: 2026, week: 5 })).toContain('다음 매물은 3주에 나옵니다');
  });

  it('제안이 없으면 빈 목록이다', () => {
    const { state } = racehorseState();
    state.sales.privateOffers = [];
    expect(privateMarketRows(state)).toEqual([]);
  });
});

describe('구매 확인창 수치', () => {
  it('호가·현재 자금·구매 뒤 자금을 보이고 살 수 있다', () => {
    const { state, horse } = racehorseState();
    state.sales.privateOffers = [offerFor(state, horse, 'market', 300_000)];
    state.owners[state.playerOwnerId]!.funds = 1_000_000;
    expect(purchaseConfirmView(state, 'po_test_market')).toEqual({
      horseName: '은빛 새벽',
      priceKo: '€300,000',
      fundsKo: '€1,000,000',
      afterKo: '€700,000',
      canBuy: true,
      blockedKo: null,
    });
  });

  it('자금이 모자라면 구매 뒤 부족액을 보이고 막는다', () => {
    const { state, horse } = racehorseState();
    state.sales.privateOffers = [offerFor(state, horse, 'market', 300_000)];
    state.owners[state.playerOwnerId]!.funds = 100_000;
    const view = purchaseConfirmView(state, 'po_test_market');
    expect(view).toMatchObject({ afterKo: '부족 €200,000', canBuy: false });
    expect(view?.blockedKo).toContain('자금이 부족');
    expect(purchaseConfirmView(state, 'missing')).toBeNull();
  });
});

describe('구매 문의 버튼 대상', () => {
  it('AI 소유 현역마(3세 이상)와 번식 암말에만 보인다', () => {
    const { state, horse } = racehorseState();
    expect(enquiryAvailable(state, horse.id)).toBe(true);

    horse.birthYear = 2024;
    expect(enquiryAvailable(state, horse.id)).toBe(false);
    horse.birthYear = 2022;

    horse.ownerId = state.playerOwnerId;
    expect(enquiryAvailable(state, horse.id)).toBe(false);

    horse.ownerId = null;
    expect(enquiryAvailable(state, horse.id)).toBe(false);

    const other = aiHorse(state);
    other.status = 'broodmare';
    other.sex = 'female';
    expect(enquiryAvailable(state, other.id)).toBe(true);
    other.sex = 'male';
    expect(enquiryAvailable(state, other.id)).toBe(false);
    other.status = 'stud';
    other.sex = 'male';
    expect(enquiryAvailable(state, other.id)).toBe(false);
    expect(enquiryAvailable(state, 'no_such_horse')).toBe(false);
  });
});

describe('구매 문의 결과 알림', () => {
  it('성공하면 호가와 기한을 알리고, 목록에 문의 출처로 나타난다', () => {
    const { state, horse } = racehorseState();
    const result = enquirePrivatePurchase(state, horse.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const notice = enquiryNoticeKo(state, horse.id, result);
    expect(notice.ok).toBe(true);
    expect(notice.text).toMatch(/^은빛 새벽 호가 €[\d,]+을 받았습니다\. 2026년 \d+월 \d주까지 개인 거래 탭에서 살 수 있습니다\.$/);
    expect(privateMarketRows(result.state).find((row) => row.horseId === horse.id)?.sourceKo).toBe('문의');
    expect(state.sales.privateOffers).toHaveLength(0);
  });

  it('거절이면 한국어 사유를 알린다', () => {
    const { state, horse } = racehorseState();
    horse.officialRating = 120;
    const result = enquirePrivatePurchase(state, horse.id);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(enquiryNoticeKo(state, horse.id, result)).toEqual({ ok: false, text: enquiryErrorKo('refused_rating') });
    expect(enquiryErrorKo('enquiry_limit')).toContain(`${PRIVATE_ENQUIRY_PER_WEEK}회`);
    expect(enquiryErrorKo('refused_group_winner')).toContain('그룹 레이스');
  });
});

describe('최근 성적 칸 — 보관 밖 경력 (M7-G2 Opus 보완)', () => {
  it('보관된 결과가 없으면 통산 기록(그룹 승·블랙타입)을 보이고, 출주가 없으면 기존 문구', () => {
    const { state, horse } = racehorseState();
    state.raceResults = [];
    horse.record = { ...horse.record, starts: 7, wins: 2, groupWins: 1, blackTypePlacings: 2 };
    state.sales.privateOffers = [offerFor(state, horse, 'market', 50_000)];
    expect(privateMarketRows(state)[0]?.formKo).toBe('통산 7전 2승 · 그룹 1승');
    horse.record = { ...horse.record, starts: 0, wins: 0, groupWins: 0, blackTypePlacings: 0 };
    expect(privateMarketRows(state)[0]?.formKo).toBe('최근 출주 기록 없음');
  });
});
