/**
 * 판매 제안 칸 뷰 모델(M6-0b2). React 없이 테스트할 수 있도록 순수 함수만 둔다.
 * 정렬: 세일 날짜(연도 → 세일 시작 주) → 말 이름. 같은 값이면 말 id 로 고정한다(결정성).
 */
import { displayName } from '../../engine/naming/register';
import type { ConsignProposalError, RemoveProposalError } from '../../engine/sales/autoSell';
import type { SalesStaticData } from '../../engine/sales/system';
import type { GameState, HorseId, SellProposal, SellProposalStatus } from '../../engine/types';
import { consignErrorKo, feeKo } from '../game/text';

/** 상태 색은 좋음·주의만 쓴다(그 밖은 색 없는 칩) */
export type SellStatusTone = 'good' | 'caution' | 'plain';

export interface SellProposalRow {
  horseId: HorseId;
  horseName: string;
  saleId: string;
  /** 세일 이름 · 연도. 예: '가상 세일 · 2026년' */
  saleLabel: string;
  /** 유보가 표기. 유보 없음이면 '유보 없음' */
  reserveKo: string;
  /** 이유 한 줄(제안 메모 · 빠짐 사유) */
  note: string;
  status: SellProposalStatus;
  statusKo: string;
  statusTone: SellStatusTone;
  /** 빼기 버튼: proposed 일 때만 */
  canRemove: boolean;
  /** 지금 위탁 버튼: proposed 일 때만 */
  canConsignNow: boolean;
}

const STATUS_KO_CONSIGNED = '위탁함';
const STATUS_KO_SKIPPED = '뺌·지나감';
const STATUS_KO_PENDING_AUTO = '자동 위탁 예정';
const STATUS_KO_PENDING_REVIEW = '검토 대기';
const RESERVE_NONE_KO = '유보 없음';
const UNKNOWN_SALE_KO = '세일 정보 없음';
/** 세일 정보가 없을 때 정렬 뒤로 보내는 주 */
const UNKNOWN_SALE_WEEK = Number.MAX_SAFE_INTEGER;

/** 제안 상태 → 칩 문구. proposed 는 자동 위탁 설정에 따라 다르다(설정이 false 면 검토 대기). */
export function sellStatusKo(status: SellProposalStatus, autoSell: boolean): string {
  if (status === 'consigned') return STATUS_KO_CONSIGNED;
  if (status === 'skipped') return STATUS_KO_SKIPPED;
  return autoSell ? STATUS_KO_PENDING_AUTO : STATUS_KO_PENDING_REVIEW;
}

function toneOf(status: SellProposalStatus, autoSell: boolean): SellStatusTone {
  if (status === 'consigned') return 'good';
  if (status === 'skipped') return 'plain';
  return autoSell ? 'good' : 'caution';
}

/** 칸 위 한 줄 안내. 자동 위탁 설정에 따라 문구가 다르다 */
export function sellProposalGuideKo(autoSell: boolean): string {
  return autoSell
    ? '빼지 않으면 위탁 마감 전 주에 자동으로 세일에 냅니다.'
    : '자동 위탁을 껐습니다. 검토한 말만 [지금 위탁]으로 세일에 냅니다.';
}

/** 칸 빈 상태 한 줄 */
export function sellProposalEmptyKo(): string {
  return '판매 제안이 없습니다.';
}

/** 빼기·지금 위탁 실패 사유 → 한국어 */
export function sellProposalErrorKo(error: RemoveProposalError | ConsignProposalError): string {
  if (error === 'no_proposal') return '판매 제안을 찾을 수 없습니다.';
  return consignErrorKo(error);
}

/** 판매 제안 행 목록. 말이 없는 제안은 뺀다. 입력 state 는 바꾸지 않는다. */
export function sellProposalRows(state: GameState, data: SalesStaticData): SellProposalRow[] {
  const autoSell = state.settings.autoSell !== false;
  const events = new Map((data.sales?.events ?? []).map((e) => [e.id, e] as const));
  const items = (state.sales.sellProposals ?? []).flatMap((p: SellProposal) => {
    const horse = state.horses[p.horseId];
    if (horse === undefined) return [];
    const event = events.get(p.saleId);
    return [{
      p,
      name: displayName(state, horse),
      week: event?.week ?? UNKNOWN_SALE_WEEK,
      saleName: event?.name ?? UNKNOWN_SALE_KO,
    }];
  });
  items.sort(
    (a, b) =>
      a.p.year - b.p.year ||
      a.week - b.week ||
      a.name.localeCompare(b.name, 'ko') ||
      (a.p.horseId < b.p.horseId ? -1 : a.p.horseId > b.p.horseId ? 1 : 0),
  );
  return items.map(({ p, name, saleName }) => ({
    horseId: p.horseId,
    horseName: name,
    saleId: p.saleId,
    saleLabel: `${saleName} · ${p.year}년`,
    reserveKo: p.reserve === null ? RESERVE_NONE_KO : feeKo(p.reserve),
    note: p.note,
    status: p.status,
    statusKo: sellStatusKo(p.status, autoSell),
    statusTone: toneOf(p.status, autoSell),
    canRemove: p.status === 'proposed',
    canConsignNow: p.status === 'proposed',
  }));
}
