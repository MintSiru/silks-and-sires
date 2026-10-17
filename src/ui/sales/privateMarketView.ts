/**
 * 개인 거래 탭 뷰 모델(M7-G2). React 없이 테스트할 수 있도록 순수 함수만 둔다.
 * 목록은 엔진 privateOfferView(추정 범위만, 가치 원값 없음)를 쓰고, 여기서 화면 문구로 바꾼다.
 * 구매 확인창 수치(호가·현재 자금·구매 뒤 자금)와 구매 문의 결과 알림 문구도 여기서 만든다.
 */
import { PRIVATE_MARKET_INTERVAL_WEEKS } from '../../engine/config/sales';
import { canSpendDiscretionary } from '../../engine/economy/solvency';
import { displayName } from '../../engine/naming/register';
import type { EnquiryError } from '../../engine/sales/privateMarket';
import {
  privateOfferView,
  type PrivateOfferKind,
  type PrivateOfferSource,
  type PrivateOfferView,
} from '../../engine/sales/privateTrade';
import type { PlayerResult } from '../../engine/season/player';
import { formatDateKo } from '../../engine/time/calendar';
import type { GameDate, GameState, Horse, HorseId, PrivateOffer } from '../../engine/types';
import { enquiryErrorKo, feeKo } from '../game/text';
import { RECENT_RUN_COUNT, recentRuns } from '../horse/horseDetailView';

/** 출처 배지 문구(시장 · 문의 · 관계) */
export const PRIVATE_SOURCE_KO: Record<PrivateOfferSource, string> = {
  market: '시장',
  enquiry: '문의',
  relation: '관계',
};

/** 출처 배지 클래스. 등급 색 토큰을 쓴다(시장 파랑 · 문의 초록 · 관계 회색) */
const PRIVATE_SOURCE_CLASS: Record<PrivateOfferSource, string> = {
  market: 'badge badge--grade-high',
  enquiry: 'badge badge--grade-mid',
  relation: 'badge badge--muted',
};

/** 말 종류 문구 */
const KIND_KO: Record<PrivateOfferKind, string> = {
  two_year_old: '2세 유망주',
  racehorse: '현역',
  broodmare: '번식 암말',
};

const SEX_SHORT_KO = { female: '암', male: '수', gelded: '거세' } as const;

/** 최근 성적·산자 칸이 비었을 때의 문구 */
const NO_RUN_KO = '최근 출주 기록 없음';
const NO_FOAL_KO = '산자 없음';
const NOT_RACED_KO = '출주 전';
const EMPTY_KO = '—';

/** 목록 한 줄(화면 표기) */
export interface PrivateMarketRow {
  offerId: string;
  horseId: HorseId;
  horseName: string;
  sourceKo: string;
  sourceClass: string;
  kindKo: string;
  /** 예: '수 4세 · 현역' */
  horseSubKo: string;
  ownerName: string;
  /** 공식 레이팅 추정 구간. 레이팅이 없으면 '—' */
  orKo: string;
  /** 현역은 최근 5전 착순, 번식 암말은 산자 성적, 2세는 '출주 전' */
  formKo: string;
  /** 예: '€70,000 ~ €140,000' */
  estimateKo: string;
  priceKo: string;
  /** 예: '2026년 3월 4주까지' */
  expiresKo: string;
  kind: PrivateOfferKind;
}

/** 구매 확인창 수치 */
export interface PurchaseConfirmView {
  horseName: string;
  priceKo: string;
  fundsKo: string;
  /** 구매 뒤 자금. 모자라면 '부족 €X' */
  afterKo: string;
  /** 살 수 있는가(자금·빚 조건) */
  canBuy: boolean;
  /** 살 수 없을 때 이유 문구, 살 수 있으면 null */
  blockedKo: string | null;
}

/** 개인 거래 탭의 빈 상태 문구: '다음 매물은 N주에 나옵니다' */
export function privateMarketEmptyKo(date: GameDate): string {
  return `지금 살 수 있는 말이 없습니다. 다음 매물은 ${nextMarketWeeks(date)}주에 나옵니다.`;
}

/**
 * 이번 주부터 다음 시장 매물 주까지 남은 주 수(1 이상). 매물은 주 번호가 PRIVATE_MARKET_INTERVAL_WEEKS 배수인 주에 생긴다.
 * 이번 주가 배수면 INTERVAL 주 뒤(다음 해 넘김 포함: 52주 → 4주)다.
 */
export function nextMarketWeeks(date: GameDate): number {
  return PRIVATE_MARKET_INTERVAL_WEEKS - (date.week % PRIVATE_MARKET_INTERVAL_WEEKS);
}

/** 성별·나이 표기. 예: 수말 4세 → '수 4세' */
function sexAgeKo(horse: Horse, year: number): string {
  const sexKey = horse.sex === 'male' && horse.gelded ? 'gelded' : horse.sex;
  return `${SEX_SHORT_KO[sexKey]} ${year - horse.birthYear}세`;
}

/** 현역 최근 5전 착순. 예: '최근 5전 1-3-2-6-1' */
function recentFormKo(state: GameState, horseId: HorseId): string {
  const runs = recentRuns(state, horseId, RECENT_RUN_COUNT);
  if (runs.length > 0) return `최근 ${runs.length}전 ${runs.map((run) => run.position).join('-')}`;
  // 결과 보관 기간 밖(게임 시작 전 경력 포함)이면 통산 기록으로 보인다(Opus 보완)
  const record = state.horses[horseId]?.record;
  if (record === undefined || record.starts === 0) return NO_RUN_KO;
  const black = record.groupWins > 0 ? ` · 그룹 ${record.groupWins}승`
    : record.blackTypePlacings > 0 ? ` · 블랙타입 입상 ${record.blackTypePlacings}` : '';
  return `통산 ${record.starts}전 ${record.wins}승${black}`;
}

/** 번식 암말 산자 성적. 예: '산자 3두 · 출주 2두 · 승리 1두 · 블랙타입 0회' */
export function mareOffspringKo(state: GameState, horseId: HorseId): string {
  const mare = state.mares[horseId];
  if (mare === undefined || mare.foals.length === 0) return NO_FOAL_KO;
  const foals = mare.foals.flatMap((id) => (state.horses[id] === undefined ? [] : [state.horses[id]]));
  const starters = foals.filter((foal) => foal.record.starts > 0).length;
  const winners = foals.filter((foal) => foal.record.wins > 0).length;
  return `산자 ${mare.foals.length}두 · 출주 ${starters}두 · 승리 ${winners}두 · 블랙타입 ${mare.blackTypeProduce}회`;
}

function formKoOf(state: GameState, view: PrivateOfferView): string {
  if (view.kind === 'broodmare') return mareOffspringKo(state, view.horseId);
  if (view.kind === 'two_year_old') return NOT_RACED_KO;
  return recentFormKo(state, view.horseId);
}

/** 개인 거래 목록(유효 기간 안, 저장 순서). 행 구성: 출처 · 말 · OR · 최근 5전/산자 · 추정 범위 · 호가 · 만료 */
export function privateMarketRows(state: GameState): PrivateMarketRow[] {
  return privateOfferView(state).flatMap((view) => {
    const horse = state.horses[view.horseId];
    if (horse === undefined) return [];
    return [
      {
        offerId: view.offerId,
        horseId: view.horseId,
        horseName: displayName(state, horse),
        sourceKo: PRIVATE_SOURCE_KO[view.source],
        sourceClass: PRIVATE_SOURCE_CLASS[view.source],
        kindKo: KIND_KO[view.kind],
        horseSubKo: `${sexAgeKo(horse, state.date.year)} · ${KIND_KO[view.kind]}`,
        ownerName: view.ownerName,
        orKo: view.orBand === null ? EMPTY_KO : `${view.orBand.low}~${view.orBand.high}`,
        formKo: formKoOf(state, view),
        estimateKo: `${feeKo(view.estimate.low)} ~ ${feeKo(view.estimate.high)}`,
        priceKo: feeKo(view.price),
        expiresKo: `${formatDateKo({ year: view.expiresYear, week: view.expiresWeek })}까지`,
        kind: view.kind,
      },
    ];
  });
}

/** 구매 확인창 수치. 제안이 없으면 null. 자금·빚 조건은 엔진 canSpendDiscretionary 와 같다 */
export function purchaseConfirmView(state: GameState, offerId: string): PurchaseConfirmView | null {
  const offer = state.sales.privateOffers.find((o) => o.id === offerId);
  if (offer === undefined) return null;
  const horse = state.horses[offer.horseId];
  const funds = state.owners[state.playerOwnerId]?.funds ?? 0;
  const after = funds - offer.price;
  const canBuy = canSpendDiscretionary(state, offer.price);
  return {
    horseName: horse === undefined ? EMPTY_KO : displayName(state, horse),
    priceKo: feeKo(offer.price),
    fundsKo: feeKo(funds),
    afterKo: after >= 0 ? feeKo(after) : `부족 ${feeKo(-after)}`,
    canBuy,
    blockedKo: canBuy ? null : '자금이 부족해 구매할 수 없습니다.',
  };
}

/**
 * 구매 문의 결과 알림(M7-G2). 성공이면 새 호가 가격과 기한, 실패면 거절 사유(한국어).
 * state 는 문의 전 상태(이름용), result 는 enquirePrivatePurchase 의 결과다.
 */
export function enquiryNoticeKo(
  state: GameState,
  horseId: HorseId,
  result: PlayerResult<EnquiryError>,
): { ok: boolean; text: string } {
  if (!result.ok) return { ok: false, text: enquiryErrorKo(result.error) };
  const horse = state.horses[horseId];
  const name = horse === undefined ? '이 말' : displayName(state, horse);
  let offer: PrivateOffer | undefined;
  for (const o of result.state.sales.privateOffers) {
    if (o.horseId === horseId && o.source === 'enquiry') offer = o;
  }
  if (offer === undefined) return { ok: true, text: `${name}에 구매 문의했습니다.` };
  const expires = formatDateKo({ year: offer.expiresYear, week: offer.expiresWeek });
  return {
    ok: true,
    text: `${name} 호가 ${feeKo(offer.price)}을 받았습니다. ${expires}까지 개인 거래 탭에서 살 수 있습니다.`,
  };
}
