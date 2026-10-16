import { bookingSeasonOf, damsireLineOf } from '../../engine/breeding/season';
import { mareQualityNote, type MatingPlanData, type MatingPlanError } from '../../engine/breeding/matingPlan';
import { buildMatingPreview } from '../../engine/breeding/preview';
import { createPedigreeLookup } from '../../engine/breeding/realPedigree';
import { totalBloodPercent } from '../../engine/breeding/inbreeding';
import { displayName } from '../../engine/naming/register';
import type { GameState, MatingProposalStatus } from '../../engine/types';
import { complementKo, distanceHintKo, feeKo, nickLabelKo } from '../game/text';

const STATUS_KO: Record<MatingProposalStatus, string> = {
  proposed: '검토 대기', approved: '승인', booked: '예약 완료', skipped: '안 함',
};
const ERROR_KO: Record<MatingPlanError, string> = {
  not_found: '교배 제안이나 암말을 찾을 수 없습니다.', not_player_mare: '내 번식 암말만 검토할 수 있습니다.',
  not_booking_window: '예약 창이 닫혀 있습니다.', invalid_status: '이미 처리한 제안은 변경할 수 없습니다.',
  stallion_not_available: '지금 예약할 수 없는 종마입니다.', invalid_fee_cap: '종부료 상한은 0 이상의 정수로 입력하세요.',
};
export function matingPlanErrorKo(error: MatingPlanError): string { return ERROR_KO[error]; }

/** DOM 없이 공개 미리보기와 제안 기록만으로 표를 만든다. */
export function matingPlanRows(state: GameState, data: MatingPlanData) {
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
      return { mareId: p.mareId, mareName: nameOf(p.mareId), quality: mareQualityNote(state, p.mareId), season: p.season,
        stallionId: sireId, stallionName: nameOf(sireId),
        fee: feeKo(p.status === 'booked' ? state.mares[p.mareId]?.bookedFor?.feePaid ?? state.mares[p.mareId]?.coveredFee ?? p.expectedFee : p.expectedFee),
        nick: preview === null ? '—' : nickLabelKo(preview.nick.label),
        inbreeding: preview === null ? '—' : `${totalBloodPercent(preview.inbreeding)}%${preview.inbreeding.length === 0 ? '' : ` (${preview.inbreeding.map((c) => c.label).join(' · ')})`}`,
        distance: preview === null ? '—' : `${complementKo(preview.complement)} · ${distanceHintKo(preview.distanceHint)}`,
        note: p.note, status: p.status, statusLabel: STATUS_KO[p.status], canApprove: editable, canChange: editable,
        alternatives: p.alternatives.map((id) => ({ id, label: nameOf(id) })),
      };
    });
}
