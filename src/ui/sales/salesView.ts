import { displayName } from '../../engine/naming/register';
import { parentageOf } from '../breeding/pedigreeNames';
/**
 * 세일 화면 뷰 모델 (M4-C10a). React 없이 테스트할 수 있도록 순수 함수만 둔다.
 * 숨김 값(로트의 시장 평가값·AI 입찰 상한)은 결과 어디에도 담지 않는다. 화면에는 추정 범위(estimateRange)만 보인다.
 */
import { SALE_PATRON_BOOK_BONUS, SALE_PATRON_PREMIUM_DISCOUNT, SALE_PATRON_PREVIEW_WEEKS } from '../../engine/config/sales';
import { patronView } from '../../engine/sales/patron';
import { privateOfferView } from '../../engine/sales/privateTrade';
import { getStallionRecords } from '../../engine/data/staticData';
import { fitsKind } from '../../engine/sales/catalogue';
import {
  liveAuctionSteps,
  lotView,
  saleCalendarView,
  type LotView,
} from '../../engine/sales/bidding';
import { announceWeekOf, type SalesStaticData } from '../../engine/sales/system';
import { estimateRange } from '../../engine/sales/valuation';
import type { UpcomingSale } from '../../engine/sales/player';
import { ageInYear, formatDateKo, monthOfWeek } from '../../engine/time/calendar';
import type {
  CountryCode,
  GameState,
  Horse,
  HorseId,
  Money,
  SaleCatalogue,
  SaleLot,
  SaleLotResult,
  SurfaceProfile,
} from '../../engine/types';
import { feeKo, patronTierKo, saleKindKo, saleStatusKo } from '../game/text';

/** 값이 없을 때 칸을 채우는 표기 */
const EMPTY_KO = '—';
/** 유보가 없는 내 위탁 표기 */
const NO_RESERVE_KO = '유보 없음';
/** 이 로트의 정보가 없을 때(철회됐거나 없는 로트) */
const NO_AUCTION_KO = '진행 정보가 없습니다(철회되었거나 없는 로트).';
/** 경매 단계 선두 표기 */
const LEADER_KO = { player: '내 입찰', ai: '다른 구매자', none: EMPTY_KO } as const;
/** 기본 필터 값: 부 이름 검색은 공백을 무시한다 */
const EMPTY_QUERY = '';

const SEX_SHORT_KO = { female: '암', male: '수', gelded: '거세' } as const;

export interface SaleCalendarRow {
  saleId: string;
  year: number;
  name: string;
  companyName: string;
  country: CountryCode;
  kindKo: string;
  /** 세일 시작 주의 월. 예: '8월' */
  monthKo: string;
  /** 카탈로그가 공개되는 주(후원 등급 반영). 화면에서는 '발표 예정 주'로 쓴다 */
  announceWeek: number;
  saleWeek: number;
  statusKo: string;
  /** 일정 상태(발표 전·카탈로그 발표·마감). 발표 전이면 카탈로그가 있어도 로트를 감춘다 */
  status: UpcomingSale['status'];
  /** 위탁 마감 주(발표 주 전 주, 세일 연도 기준). 1 미만이면 마감 없음 */
  consignLastWeek: number;
  /** 카탈로그가 없거나 발표 전(아직 안 보임)이면 null */
  lots: number | null;
  myBids: number;
  myConsignments: number;
}

export interface CatalogueFilter {
  book?: number;
  sireQuery?: string;
  onlyMyBids?: boolean;
}

export interface CatalogueRow {
  lotNo: number;
  book: number;
  horseId: HorseId;
  horseName: string;
  /** 예: '수 1세', '암 2세', '거세 3세'. 말을 찾을 수 없으면 '—' */
  sexAgeKo: string;
  sireName: string;
  damsireName: string;
  /** 부의 주로 성향 경고(M4-C9). 더트·겸용 혈통이면 문구, 잔디면 null */
  surfaceNoteKo: string | null;
  /** 예: '상업 생산자 <이름>' · '마주 <이름>' · '내 위탁' */
  vendorKo: string;
  /** 예: '€70,000 ~ €140,000' */
  estimateKo: string;
  myBid: Money | null;
  /** 결과가 없으면 null */
  resultKo: string | null;
}

export interface LotDetailView extends LotView {
  sireName: string;
  /** 부의 주로 성향 경고(M4-C9). 더트·겸용 혈통이면 문구, 잔디면 null */
  surfaceNoteKo: string | null;
  damName: string;
  damsireName: string;
  saleDateKo: string;
  vendorKo: string;
  estimateKo: string;
  /** 내 위탁 로트일 때만 유보가 문구, 그 밖에는 null */
  reserveKo: string | null;
}

export interface LiveStepRow {
  priceKo: string;
  leaderKo: string;
  droppedKo: string;
}

export interface LiveAuctionView {
  steps: LiveStepRow[];
  resultKo: string;
}

export interface ConsignOption {
  saleId: string;
  name: string;
  kindKo: string;
  announceWeek: number;
  /** 위탁 마감 문구. 예: '2026년 6월 2주까지' */
  deadlineKo: string;
}

export interface ConsignableRow {
  horseId: HorseId;
  horseName: string;
  /** 이미 위탁했거나 카탈로그에 올라간 세일 이름. 없으면 null */
  consignedSaleName: string | null;
  /** 위탁 중(카탈로그 전)인 말의 취소 마감 문구. 카탈로그에 올라갔거나 위탁이 없으면 null */
  consignedDeadlineKo: string | null;
  options: ConsignOption[];
}

function findCatalogue(state: GameState, saleId: string, year: number): SaleCatalogue | undefined {
  return state.sales.catalogues.find((c) => c.saleId === saleId && c.year === year);
}

function companyNameOf(data: SalesStaticData, companyId: string): { name: string; country: CountryCode } {
  const company = data.sales?.companies.find((c) => c.id === companyId);
  if (company === undefined) {
    throw new RangeError(`세일 화면: 회사가 없다: ${companyId}`);
  }
  return { name: company.name, country: company.country };
}

function saleNameOf(data: SalesStaticData, saleId: string): string {
  return data.sales?.events.find((e) => e.id === saleId)?.name ?? saleId;
}

/** 실명 종마 key → 주로 성향(잔디·더트·겸용) */
let surfaceByKey: Map<string, SurfaceProfile> | null = null;

/**
 * 부의 주로 성향 경고(M4-C9): 더트 혈통이면 유럽 잔디 적성이 불확실하다는 문구, 겸용이면 짧은 안내, 잔디·미상이면 null.
 * 미국 세일 로트(미국 계류 종마 자마)를 살 때 위험이 보이게 한다.
 */
function surfaceNoteOf(state: GameState, sireId: HorseId | null): string | null {
  if (sireId === null) return null;
  const key = state.stallions[sireId]?.realKey ?? null;
  if (key === null) return null;
  surfaceByKey ??= new Map(getStallionRecords().map((r) => [r.key, r.surfaceProfile] as const));
  const surface = surfaceByKey.get(key);
  if (surface === 'dirt') return '더트 혈통 — 유럽 잔디 적성 불확실';
  if (surface === 'both') return '잔디·더트 겸용 혈통';
  return null;
}

function sireNameOf(state: GameState, sireId: HorseId | null): string {
  if (sireId === null) return EMPTY_KO;
  return (state.horses[sireId] === undefined ? EMPTY_KO : displayName(state, state.horses[sireId]!));
}

/** 성별·나이 표기. 예: 수말 1세 → '수 1세' */
function sexAgeKo(horse: Horse | undefined, year: number): string {
  if (horse === undefined) return EMPTY_KO;
  const sexKey = horse.sex === 'male' && horse.gelded ? 'gelded' : horse.sex;
  return `${SEX_SHORT_KO[sexKey]} ${ageInYear(horse.birthYear, year)}세`;
}

function vendorKoOf(state: GameState, vendor: SaleLot['vendor']): string {
  if (vendor.kind === 'breeder') {
    return `상업 생산자 ${state.breeders[vendor.id]?.name ?? vendor.id}`;
  }
  if (vendor.id === state.playerOwnerId) return '내 위탁';
  return `마주 ${state.owners[vendor.id]?.name ?? vendor.id}`;
}

function estimateKoOf(valuation: Money): string {
  const range = estimateRange(valuation);
  return `${feeKo(range.low)} ~ ${feeKo(range.high)}`;
}

/** 결과 한 줄(화면 표기). 낙찰자가 나면 그 이름을 붙인다. */
function resultKoOf(state: GameState, result: SaleLotResult | null): string | null {
  if (result === null) return null;
  if (result.kind === 'withdrawn') return '출품 철회';
  if (result.kind === 'bought_back') {
    return result.lastBid > 0 ? `유찰 (최고 호가 ${feeKo(result.lastBid)})` : '유찰';
  }
  if (result.buyerId === state.playerOwnerId) return `내 낙찰 ${feeKo(result.price)}`;
  return `낙찰 ${feeKo(result.price)} (${state.owners[result.buyerId]?.name ?? result.buyerId})`;
}

function myBidOf(state: GameState, saleId: string, year: number, lotNo: number): Money | null {
  const bid = state.sales.playerBids.find((b) => b.saleId === saleId && b.year === year && b.lotNo === lotNo);
  return bid === undefined ? null : bid.maxBid;
}

/** 세일 캘린더 행. 세일 일정(saleCalendarView)에 회사명·카탈로그 로트 수를 붙인다. */
export function saleCalendarRows(state: GameState, data: SalesStaticData): SaleCalendarRow[] {
  return saleCalendarView(state, data).map((entry) => {
    const { event, year, status } = entry;
    const company = companyNameOf(data, event.companyId);
    const catalogue = findCatalogue(state, event.id, year);
    return {
      saleId: event.id,
      year,
      name: event.name,
      companyName: company.name,
      country: company.country,
      kindKo: saleKindKo(event.kind),
      monthKo: `${monthOfWeek(event.week)}월`,
      announceWeek: entry.announceWeek,
      saleWeek: event.week,
      statusKo: saleStatusKo(status),
      status,
      consignLastWeek: announceWeekOf(event) - 1,
      // 발표 전이면 카탈로그가 이미 있어도 아직 보이지 않으므로 로트 수를 주지 않는다
      lots: catalogue === undefined || status === 'upcoming' ? null : catalogue.lots.length,
      myBids: entry.myBidCount,
      myConsignments: entry.myConsignmentCount,
    };
  });
}

/**
 * 카탈로그 로트 목록(카탈로그 순서). filter.book 은 북 번호, filter.sireQuery 는 부 이름 부분 일치(대소문자 무시),
 * filter.onlyMyBids 는 내 입찰이 걸린 로트만. 카탈로그가 없으면 빈 배열.
 */
export function catalogueRows(
  state: GameState,
  saleId: string,
  year: number,
  _data: SalesStaticData,
  filter: CatalogueFilter = {},
): CatalogueRow[] {
  const catalogue = findCatalogue(state, saleId, year);
  if (catalogue === undefined) return [];
  const query = (filter.sireQuery ?? EMPTY_QUERY).trim().toLowerCase();
  const rows: CatalogueRow[] = [];
  for (const lot of catalogue.lots) {
    if (filter.book !== undefined && lot.book !== filter.book) continue;
    const sireName = sireNameOf(state, lot.sireId);
    if (query !== EMPTY_QUERY && !sireName.toLowerCase().includes(query)) continue;
    const myBid = myBidOf(state, saleId, year, lot.lotNo);
    if (filter.onlyMyBids === true && myBid === null) continue;
    const horse = state.horses[lot.horseId];
    rows.push({
      lotNo: lot.lotNo,
      book: lot.book,
      horseId: lot.horseId,
      horseName: state.horses[lot.horseId] === undefined
        ? lot.horseName : displayName(state, state.horses[lot.horseId]!),
      sexAgeKo: sexAgeKo(state.horses[lot.horseId], year),
      sireName,
      damsireName: horse === undefined ? EMPTY_KO : parentageOf(state, horse).damsire,
      surfaceNoteKo: surfaceNoteOf(state, lot.sireId),
      vendorKo: vendorKoOf(state, lot.vendor),
      estimateKo: estimateKoOf(lot.valuation),
      myBid,
      resultKo: resultKoOf(state, lot.result),
    });
  }
  return rows;
}

/**
 * 로트 상세. lotView 결과에 부 이름·모 이름('—')·판매 날짜·판매자·추정 범위·유보가(내 위탁일 때)를 붙인다.
 * 로트가 없으면 null. 평가값·AI 상한은 담지 않는다.
 */
export function lotDetailView(
  state: GameState,
  saleId: string,
  year: number,
  lotNo: number,
  data: SalesStaticData,
): LotDetailView | null {
  const view = lotView(state, saleId, year, lotNo, data);
  if (view === null) return null;
  const catalogue = findCatalogue(state, saleId, year);
  const lot = catalogue?.lots.find((l) => l.lotNo === lotNo);
  if (lot === undefined) return null;
  const ownConsignment = lot.vendor.kind === 'owner' && lot.vendor.id === state.playerOwnerId;
  const horse = state.horses[lot.horseId];
  const parentage = horse === undefined ? null : parentageOf(state, horse);
  const reserveKo = ownConsignment
    ? view.lot.reserveKnown === null
      ? NO_RESERVE_KO
      : feeKo(view.lot.reserveKnown)
    : null;
  return {
    ...view,
    lot: { ...view.lot, horseName: state.horses[lot.horseId] === undefined
      ? view.lot.horseName : displayName(state, state.horses[lot.horseId]!) },
    sireName: sireNameOf(state, view.lot.sireId),
    surfaceNoteKo: surfaceNoteOf(state, view.lot.sireId),
    damName: parentage?.dam ?? EMPTY_KO,
    damsireName: parentage?.damsire ?? EMPTY_KO,
    saleDateKo: formatDateKo(view.saleWeek),
    vendorKo: vendorKoOf(state, lot.vendor),
    estimateKo: estimateKoOf(lot.valuation),
    reserveKo,
  };
}

/**
 * 실시간 경매 보기. liveAuctionSteps 의 단계를 가격·선두·이탈 문구로 바꾸고, 마지막 단계로 최종 결과 문구를 만든다.
 * 단계가 없으면(철회·없는 로트) 빈 목록과 안내 문구.
 */
export function liveAuctionView(
  state: GameState,
  saleId: string,
  year: number,
  lotNo: number,
  playerMax: Money | null,
  data: SalesStaticData,
): LiveAuctionView {
  const steps = liveAuctionSteps(state, saleId, year, lotNo, playerMax, data);
  const rows: LiveStepRow[] = steps.map((step) => ({
    priceKo: feeKo(step.price),
    leaderKo: LEADER_KO[step.leader],
    droppedKo: step.dropped > 0 ? `${step.dropped}명 이탈` : EMPTY_KO,
  }));
  const last = steps[steps.length - 1];
  if (last === undefined) return { steps: rows, resultKo: NO_AUCTION_KO };
  let resultKo: string;
  if (last.leader === 'player') resultKo = `내 낙찰 ${feeKo(last.price)}`;
  else if (last.leader === 'ai') resultKo = `다른 구매자 낙찰 ${feeKo(last.price)}`;
  else resultKo = '유찰';
  return { steps: rows, resultKo };
}

/** 세일 이름 정렬 순서: 발표 주, 그다음 id */
function compareOptions(a: ConsignOption, b: ConsignOption): number {
  if (a.announceWeek !== b.announceWeek) return a.announceWeek - b.announceWeek;
  return a.saleId < b.saleId ? -1 : a.saleId > b.saleId ? 1 : 0;
}

/** 이 말이 이미 올라가 있는 세일 이름(위탁 또는 진행 중 카탈로그의 미판매 로트) */
function consignedSaleNameOf(state: GameState, data: SalesStaticData, horseId: HorseId): string | null {
  const consignment = state.sales.consignments.find((c) => c.horseId === horseId);
  if (consignment !== undefined) return saleNameOf(data, consignment.saleId);
  const catalogue = state.sales.catalogues.find(
    (cat) => cat.status === 'catalogued' && cat.lots.some((l) => l.horseId === horseId && l.result === null),
  );
  return catalogue === undefined ? null : saleNameOf(data, catalogue.saleId);
}

/** 위탁 마감 문구: '2026년 6월 2주까지'. 주 번호가 1 미만이면 '—' */
function deadlineKoOf(year: number, week: number): string {
  return week < 1 ? EMPTY_KO : `${formatDateKo({ year, week })}까지`;
}

/**
 * 위탁 중(카탈로그 전)인 말의 취소 마감 문구. 발표 주 전 주까지 취소할 수 있다.
 * 카탈로그에 올라간 말이나 위탁이 없는 말이면 null.
 */
function consignedDeadlineOf(state: GameState, data: SalesStaticData, horseId: HorseId): string | null {
  const consignment = state.sales.consignments.find((c) => c.horseId === horseId);
  if (consignment === undefined) return null;
  const event = data.sales?.events.find((e) => e.id === consignment.saleId);
  if (event === undefined) return null;
  return deadlineKoOf(consignment.year, announceWeekOf(event) - 1);
}

/**
 * 플레이어 말마다 올해 출품 가능한 미발표 세일 목록. 조건: 발표 주가 이번 주보다 뒤(위탁 가능)이고 fitsKind 가 참.
 * 이미 위탁했거나 카탈로그에 올라간 말은 consignedSaleName 에 그 세일 이름을 넣는다.
 * 각 세일 옵션의 deadlineKo 는 위탁 마감 주(발표 주 전 주), consignedDeadlineKo 는 위탁 중인 말의 취소 마감이다.
 */
export function consignableRows(state: GameState, data: SalesStaticData): ConsignableRow[] {
  const events = data.sales?.events ?? [];
  const year = state.date.year;
  const owner = state.owners[state.playerOwnerId];
  const horses = (owner?.horseIds ?? []).flatMap((id) => {
    const horse = state.horses[id];
    return horse === undefined ? [] : [horse];
  });
  return horses.map((horse) => {
    const options: ConsignOption[] = events
      .filter((e) => announceWeekOf(e) > state.date.week && fitsKind(horse, e.kind, year))
      .map((e) => ({
        saleId: e.id,
        name: e.name,
        kindKo: saleKindKo(e.kind),
        announceWeek: announceWeekOf(e),
        deadlineKo: deadlineKoOf(year, announceWeekOf(e) - 1),
      }))
      .sort(compareOptions);
    return {
      horseId: horse.id,
      horseName: displayName(state, horse),
      consignedSaleName: consignedSaleNameOf(state, data, horse.id),
      consignedDeadlineKo: consignedDeadlineOf(state, data, horse.id),
      options,
    };
  });
}

/** 개인 제안의 공개 정보만 화면에 전달한다. */
export function privateOfferRows(state: GameState) {
  return privateOfferView(state).map((offer) => ({
    offerId: offer.offerId,
    horseId: offer.horseId,
    horseName: state.horses[offer.horseId] === undefined
      ? offer.horseName : displayName(state, state.horses[offer.horseId]!),
    sexAgeKo: sexAgeKo(state.horses[offer.horseId], state.date.year),
    sireName: sireNameOf(state, offer.sireId),
    ownerName: offer.ownerName,
    priceKo: feeKo(offer.price),
    estimateKo: `${feeKo(offer.estimate.low)} ~ ${feeKo(offer.estimate.high)}`,
    expiresKo: `${formatDateKo({ year: offer.expiresYear, week: offer.expiresWeek })}까지`,
  }));
}

export function patronBadge(state: GameState) {
  const view = patronView(state);
  return {
    tierKo: patronTierKo(view.tier),
    spendKo: feeKo(view.spendTwoYears),
    nextKo: view.nextTier === null ? '최고 등급' : `${patronTierKo(view.nextTier)}까지 ${feeKo(view.toNext ?? 0)}`,
    benefitsKo:
      view.tier === 'none'
        ? ['혜택 없음 — 최근 2년 세일 구매가 쌓이면 실버·골드 혜택(카탈로그 사전 열람·수수료 할인·출품 우대)']
        : [
            `카탈로그 ${SALE_PATRON_PREVIEW_WEEKS[view.tier]}주 먼저 열람`,
            `구매 수수료 −${Math.round(SALE_PATRON_PREMIUM_DISCOUNT[view.tier] * 100)}%p`,
            ...(SALE_PATRON_BOOK_BONUS[view.tier] > 0 ? ['내 출품을 한 북 앞에 배정'] : []),
          ],
  };
}
