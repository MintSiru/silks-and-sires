import { retainerRenewalsDue, yearEndCandidates, type YearEndError } from '../../engine/stud/yearEnd';
import { freeStudSlots } from '../../engine/stud/stand';
import { relationKey, relationOf } from '../../engine/economy/relations';
import type { GameState, YearEndChoice, YearEndSubmission } from '../../engine/types';
import { feeKo, relationTierKo } from '../game/text';

const CHOICE_LABELS: Record<YearEndChoice, string> = {
  continue: '현역 속행', geld: '거세 후 현역 속행', stud: '종마',
  broodmare: '번식 암말', retire: '은퇴 (목장을 떠남)',
  sell_domestic: '종마로 국내 판매', sell_overseas: '종마로 해외 판매',
};

export function yearEndView(state: GameState) {
  return {
    year: state.date.year,
    freeSlotsKo: `종마사 빈 칸 ${freeStudSlots(state)}/${state.stud.slots}`,
    horses: yearEndCandidates(state).map((candidate) => {
      const horse = state.horses[candidate.horseId]!;
      const record = horse.record;
      return {
        horseId: horse.id, name: horse.name,
        sexKo: horse.gelded ? '거세마' : horse.sex === 'male' ? '수말' : '암말',
        newAge: candidate.newAge,
        careerKo: `${record.starts}전 ${record.wins}승 · 그룹 ${record.groupWins}승 · 상금 ${feeKo(record.earnings)}`,
        options: candidate.allowed.map((choice) => ({ choice,
          labelKo: choice === 'stud'
            ? `종마 (예상 첫 종부료 ${feeKo(candidate.studFeeEstimate!)})` : CHOICE_LABELS[choice] })),
        recommended: candidate.recommended,
      };
    }),
    retainers: retainerRenewalsDue(state).map((contract) => ({
      kind: contract.kind, personId: contract.personId,
      nameKo: (contract.kind === 'trainer' ? state.trainers : state.jockeys)[contract.personId]?.name ?? contract.personId,
      roleKo: contract.kind === 'trainer' ? '조교사' : '기수',
      feeKo: feeKo(contract.annualFee),
      relationKo: relationTierKo(relationOf(state, relationKey(contract.kind, contract.personId))),
    })),
  };
}

const ERRORS: Record<YearEndError, string> = {
  not_pending: '연말 정산 대기 중이 아닙니다.', wrong_year: '정산 연도가 맞지 않습니다.',
  missing_horse: '진로를 정하지 않은 말이 있습니다.', duplicate_horse: '같은 말의 진로가 중복되었습니다.',
  unknown_horse: '정산 대상이 아닌 말입니다.', choice_not_allowed: '선택할 수 없는 진로입니다.',
  no_free_slot: '종마사 빈 칸이 부족합니다.', retainer_mismatch: '갱신 대상 계약을 모두 확인해 주세요.',
};

export function yearEndErrorKo(error: YearEndError): string {
  return ERRORS[error];
}

export function defaultSubmission(state: GameState): YearEndSubmission {
  return {
    year: state.date.year,
    horses: yearEndCandidates(state).map(({ horseId, recommended }) => ({ horseId, choice: recommended })),
    retainers: retainerRenewalsDue(state).map(({ kind, personId }) => ({ kind, personId, renew: true })),
  };
}
