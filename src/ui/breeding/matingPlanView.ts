import { bookingSeasonOf, damsireLineOf } from '../../engine/breeding/season';
import { matingNeedsApproval, mareQuality, mareQualityNote, type MatingPlanData, type MatingPlanError } from '../../engine/breeding/matingPlan';
import { buildMatingPreview } from '../../engine/breeding/preview';
import { createPedigreeLookup } from '../../engine/breeding/realPedigree';
import { MATING_AUTO_BOOK_MAX_INBREEDING } from '../../engine/config/mating';
import { totalBloodPercent } from '../../engine/breeding/inbreeding';
import { gradeOf } from '../../engine/horse/assessment';
import { displayName } from '../../engine/naming/register';
import type {
  GameState, HorseId, Grade, MatingPreview, MatingProposalStatus, Money, NickLabel,
} from '../../engine/types';
import { complementKo, distanceHintKo, feeKo, nickLabelKo } from '../game/text';
import type { StatusTone } from '../common/badges';

const STATUS_KO: Record<MatingProposalStatus, string> = {
  proposed: '검토 대기', approved: '승인', booked: '예약 완료', skipped: '안 함',
};
const ERROR_KO: Record<MatingPlanError, string> = {
  not_found: '교배 제안이나 암말을 찾을 수 없습니다.', not_player_mare: '내 번식 암말만 검토할 수 있습니다.',
  not_booking_window: '예약 창이 닫혀 있습니다.', invalid_status: '이미 처리한 제안은 변경할 수 없습니다.',
  stallion_not_available: '지금 예약할 수 없는 종마입니다.', invalid_fee_cap: '종부료 상한은 0 이상의 정수로 입력하세요.',
};
export function matingPlanErrorKo(error: MatingPlanError): string { return ERROR_KO[error]; }

/** 근친 혈량(%) 주의 기준: 이 값 이상이면 '근친 주의'(주의 톤, 자동 예약 승인 기준 MATING_AUTO_BOOK_MAX_INBREEDING 과 같다). 화면 판정용 상수다. */
export const INBREED_CAUTION_PERCENT = 12.5;
/** 근친 혈량(%) 위험 기준: 이 값을 넘으면 '근친 위험'(위험 톤). 화면 판정용 상수다. */
export const INBREED_RISK_PERCENT = 18.75;

/** 암말 수준 등급. 엔진 등급 기준선(gradeOf)을 쓰되 최하(E)는 D 로 묶는다. */
export type MatingQualityGrade = 'S' | 'A' | 'B' | 'C' | 'D';

/** 수준 점수(0~100, mareQuality) → S/A/B/C/D. 순수 함수. */
export function matingQualityGrade(score: number): MatingQualityGrade {
  const grade: Grade = gradeOf(score);
  return grade === 'E' ? 'D' : grade;
}

export type JudgementTone = StatusTone;

export interface MatingJudgement {
  /** 한 줄 요약. 예: '궁합 좋음 · 근친 주의' */
  summary: string;
  tone: JudgementTone;
  /** 주의·위험이면 사유만(예: '근친 검토 필요'). 확인창 목록용(아르곤 4차 검토) */
  reason?: string;
}

/** 종합 판단 입력: 보완형 가능성, 공개 니크, 근친 혈량(%). 판단 불가면 null. */
export interface MatingJudgementInput {
  complement: MatingPreview['complement'] | null;
  nick: NickLabel | null;
  inbreedPercent: number | null;
}

/** 주의 요소가 있을 때 첫 배지 뒤에 붙일 긍정 요소 수. 나머지 긍정 요소는 근거 펼침에 남는다(화면 표시 상수). */
export const MATING_POSITIVE_AFTER_RISK = 1;

/**
 * 종합 판단 한 줄. 주의 요소가 있으면 주의 문구를 첫 배지로 두고 긍정 요소는 뒤에 MATING_POSITIVE_AFTER_RISK 개까지만 붙인다.
 * 주의 문구는 근친 위험 > 근친 주의 > 니크 나쁨 순으로 하나만 고르고, 나머지 요소는 근거 펼침에서 본다.
 * 근친 혈량이 INBREED_CAUTION_PERCENT 초과면 주의, INBREED_RISK_PERCENT 초과면 위험.
 * 위험 톤은 근친 위험에서만 쓴다(근친 주의·니크 나쁨은 주의 톤).
 */
export function matingJudgement(input: MatingJudgementInput): MatingJudgement {
  if (input.complement === null || input.inbreedPercent === null) {
    return { summary: '판단 정보 없음', tone: 'muted' };
  }
  const positives: string[] = [];
  if (input.complement === 'likely') positives.push('궁합 좋음');
  if (input.nick === 'excellent' || input.nick === 'good') positives.push('니크 좋음');
  let reason: string | null = null;
  let leadTone: JudgementTone = 'warn';
  if (input.inbreedPercent > INBREED_RISK_PERCENT) {
    reason = '근친 검토 필요';
    leadTone = 'danger';
  } else if (input.inbreedPercent >= INBREED_CAUTION_PERCENT) {
    reason = '근친 검토 필요';
  } else if (input.nick === 'poor') {
    reason = '니크 나쁨';
  }
  if (reason !== null) {
    const lead = `${leadTone === 'danger' ? '위험' : '주의'} — ${reason}`;
    const parts = [lead, ...positives.slice(0, MATING_POSITIVE_AFTER_RISK)];
    return { summary: parts.join(' · '), tone: leadTone, reason };
  }
  if (positives.length === 0) return { summary: '특이 사항 없음', tone: 'muted' };
  return { summary: positives.join(' · '), tone: 'good' };
}

/** 제안 상태 → 상태 톤. 검토 대기는 주의, 예약·승인은 좋음, 안 함은 중립. */
export function matingStatusTone(status: MatingProposalStatus): StatusTone {
  if (status === 'proposed') return 'warn';
  if (status === 'skipped') return 'muted';
  return 'good';
}

export interface MatingAlternative { id: HorseId; label: string }

export interface MatingPlanRow {
  mareId: HorseId;
  mareName: string;
  /** 근거용 수준 문구(최고 OR·블랙타입 산자·나이 포함) */
  quality: string;
  qualityGrade: MatingQualityGrade;
  season: number;
  stallionId: HorseId;
  stallionName: string;
  /** 화면 표기 종부료. 예: '€12,000' */
  fee: string;
  /** 숫자 종부료(합계 계산용) */
  feeAmount: Money;
  nick: string;
  nickLabel: NickLabel | null;
  inbreeding: string;
  inbreedPercent: number | null;
  /** 보완형·거리 힌트 문구 */
  distance: string;
  complement: MatingPreview['complement'] | null;
  note: string;
  status: MatingProposalStatus;
  statusLabel: string;
  /** 검토 대기 제안이 근친 상한 이상이라 자동 예약하지 않는 경우의 안내 문구(M7-C3). 아니면 null */
  approvalNote: string | null;
  canApprove: boolean;
  canChange: boolean;
  alternatives: MatingAlternative[];
  judgement: MatingJudgement;
}

/** DOM 없이 공개 미리보기와 제안 기록만으로 표를 만든다. */
export function matingPlanRows(state: GameState, data: MatingPlanData): MatingPlanRow[] {
  const lookup = createPedigreeLookup(state.horses, data.stallionRecords ?? []);
  const nameOf = (id: string) => state.horses[id] === undefined ? '기록 없음' : displayName(state, state.horses[id]!);
  return (state.stud.matingProposals ?? []).filter((p) => state.horses[p.mareId]?.ownerId === state.playerOwnerId)
    .slice().sort((a, b) => b.season - a.season || (a.mareId < b.mareId ? -1 : a.mareId > b.mareId ? 1 : 0)).map((p) => {
      const dam = state.horses[p.mareId]!;
      const sireId = p.bookedStallionId ?? p.stallionId;
      const sire = state.horses[sireId];
      const preview = sire === undefined ? null : buildMatingPreview({ sire, dam, lookup,
        damsire: dam.sireId === null ? null : state.horses[dam.sireId] ?? null,
        damsireLineId: damsireLineOf(state, dam), nicks: data.nicks, revealedNicks: new Set(state.breeding.revealedNicks) });
      const editable = p.season === bookingSeasonOf(state.date) && dam.status === 'broodmare' && p.status === 'proposed';
      const feeAmount: Money = p.status === 'booked'
        ? state.mares[p.mareId]?.bookedFor?.feePaid ?? state.mares[p.mareId]?.coveredFee ?? p.expectedFee
        : p.expectedFee;
      const inbreedPercent = preview === null ? null : totalBloodPercent(preview.inbreeding);
      const needsApproval = p.status === 'proposed' && sire !== undefined && matingNeedsApproval(lookup, p.stallionId, p.mareId);
      const nickLabel = preview === null ? null : preview.nick.label;
      const complement = preview === null ? null : preview.complement;
      return {
        mareId: p.mareId, mareName: nameOf(p.mareId), quality: mareQualityNote(state, p.mareId),
        qualityGrade: matingQualityGrade(mareQuality(state, p.mareId)), season: p.season,
        stallionId: sireId, stallionName: nameOf(sireId),
        fee: feeKo(feeAmount), feeAmount,
        nick: nickLabel === null ? '—' : nickLabelKo(nickLabel), nickLabel,
        inbreeding: preview === null || inbreedPercent === null
          ? '—'
          : `${inbreedPercent}%${preview.inbreeding.length === 0 ? '' : ` (${preview.inbreeding.map((c) => c.label).join(' · ')})`}`,
        inbreedPercent,
        distance: preview === null ? '—' : `${complementKo(preview.complement)} · ${distanceHintKo(preview.distanceHint)}`,
        complement,
        note: p.note, status: p.status, statusLabel: STATUS_KO[p.status],
        approvalNote: needsApproval ? `승인 필요 — 근친 ${MATING_AUTO_BOOK_MAX_INBREEDING * 100}% 이상` : null,
        canApprove: editable, canChange: editable,
        alternatives: p.alternatives.map((id) => ({ id, label: nameOf(id) })),
        judgement: matingJudgement({ complement, nick: nickLabel, inbreedPercent }),
      };
    });
}

/** 모두 승인 확인 창에 보일 요약: 대상 두수·총 종부료·주의/위험 배합 수. 대상은 승인 가능한 행이다. */
export interface ApprovalSummary {
  count: number;
  totalFee: Money;
  cautionCount: number;
  riskCount: number;
}

export function approvalSummary(rows: readonly MatingPlanRow[]): ApprovalSummary {
  const targets = rows.filter((r) => r.canApprove);
  return {
    count: targets.length,
    totalFee: targets.reduce((sum, r) => sum + r.feeAmount, 0),
    cautionCount: targets.filter((r) => r.judgement.tone === 'warn').length,
    riskCount: targets.filter((r) => r.judgement.tone === 'danger').length,
  };
}

/** '모두 승인' 버튼 상태: 라벨·활성 여부·비활성 사유(없으면 null). */
export interface BulkApproveState {
  enabled: boolean;
  label: string;
  reason: string | null;
}

export function bulkApproveState(
  rows: readonly MatingPlanRow[],
  context: { locked: boolean; windowOpen: boolean },
): BulkApproveState {
  if (context.locked) return { enabled: false, label: '모두 승인', reason: '현재 진행이 잠겨 있습니다.' };
  if (!context.windowOpen) {
    return { enabled: false, label: '모두 승인', reason: '예약 창이 열리면 제안을 검토할 수 있습니다.' };
  }
  if (rows.length === 0) {
    return { enabled: false, label: '모두 승인', reason: '현재 교배 제안이 없습니다.' };
  }
  if (!rows.some((r) => r.canApprove)) {
    return { enabled: false, label: '모두 처리됨', reason: '승인 대기 제안이 없습니다. 모두 승인 또는 안 함으로 처리됐습니다.' };
  }
  return { enabled: true, label: '모두 승인', reason: null };
}
