/**
 * 세일 동행 검사(M4-C6). 전속 조교사, 또는 관계 SALE_INSPECT_MIN_RELATION 이상인 조교사가 세일 로트를 보고
 * 소견(Assessment)을 얻는다. 소견의 정확도는 그 조교사의 상마안(eye, 전속이면 가산)이 정한다.
 * 순수 함수: state 는 바꾸지 않고(검사 비용 없음), 난수는 검사 키로 만든 rng 만 쓴다.
 * eye 값은 어떤 결과에도 내보내지 않는다(숨김 능력).
 */
import { getSalesData } from '../data/staticData';
import { isCatalogueVisible } from './patron';
import { SALE_INSPECT_MIN_RELATION } from '../config/sales';
import { contractFor } from '../economy/contractQuery';
import { relationKey, relationOf } from '../economy/relations';
import { assessHorse } from '../horse/assessment';
import { stageFor, trainerAssessorSkill } from '../horse/playerView';
import { createRng } from '../rng';
import type { Assessment, GameState, TrainerId } from '../types';

/** 동행 검사 가능한 조교사 한 줄(화면용). eye 는 없다 */
export interface InspectorOption {
  trainerId: TrainerId;
  name: string;
  reason: 'retained' | 'relation';
}

export type InspectError =
  | 'catalogue_not_found'
  | 'lot_not_found'
  | 'lot_closed'
  | 'horse_missing'
  | 'not_eligible';

export type InspectResult = { ok: true; assessment: Assessment } | { ok: false; error: InspectError };

/** 검사 자격 사유. 전속이면 'retained', 관계가 하한 이상이면 'relation', 둘 다 아니면 null */
function inspectorReason(state: GameState, trainerId: TrainerId): InspectorOption['reason'] | null {
  if (contractFor(state, 'trainer', trainerId) !== undefined) return 'retained';
  if (relationOf(state, relationKey('trainer', trainerId)) >= SALE_INSPECT_MIN_RELATION) return 'relation';
  return null;
}

/**
 * 동행 검사 가능한 조교사 목록. 전속 조교사가 먼저, 그다음 관계 하한 이상인 조교사.
 * 같은 묶음 안에서는 이름 오름차순(같으면 id 오름차순).
 */
export function eligibleInspectors(state: GameState): InspectorOption[] {
  const rows: InspectorOption[] = [];
  for (const trainer of Object.values(state.trainers)) {
    const reason = inspectorReason(state, trainer.id);
    if (reason === null) continue;
    rows.push({ trainerId: trainer.id, name: trainer.name, reason });
  }
  rows.sort((a, b) => {
    if (a.reason !== b.reason) return a.reason === 'retained' ? -1 : 1;
    if (a.name !== b.name) return a.name < b.name ? -1 : 1;
    if (a.trainerId !== b.trainerId) return a.trainerId < b.trainerId ? -1 : 1;
    return 0;
  });
  return rows;
}

/**
 * 조교사 한 명이 세일 로트 한 마리를 본 소견.
 * 검사 순서: 카탈로그 → 로트 → 로트 마감(카탈로그 closed 또는 결과 있음) → 말 → 검사 자격(조교사 존재 포함).
 * 평가자 능력 = trainerAssessorSkill, 단계 = stageFor(로트 말, state.date).
 * rng = createRng(`inspect:${saleId}:${year}:${lotNo}:${trainerId}`): 같은 조교사·같은 로트면 같은 결과.
 */
export function inspectLot(
  state: GameState,
  saleId: string,
  year: number,
  lotNo: number,
  trainerId: TrainerId,
): InspectResult {
  const catalogue = state.sales.catalogues.find((c) => c.saleId === saleId && c.year === year);
  const event = getSalesData().events.find((e) => e.id === saleId);
  if (catalogue === undefined || event === undefined || !isCatalogueVisible(state, event, year)) return { ok: false, error: 'catalogue_not_found' };
  const lot = catalogue.lots.find((l) => l.lotNo === lotNo);
  if (lot === undefined) return { ok: false, error: 'lot_not_found' };
  if (catalogue.status === 'closed' || lot.result !== null) return { ok: false, error: 'lot_closed' };
  const horse = state.horses[lot.horseId];
  if (horse === undefined) return { ok: false, error: 'horse_missing' };
  if (state.trainers[trainerId] === undefined || inspectorReason(state, trainerId) === null) {
    return { ok: false, error: 'not_eligible' };
  }

  const skill = trainerAssessorSkill(state, trainerId);
  const rng = createRng(`inspect:${saleId}:${year}:${lotNo}:${trainerId}`);
  const assessment = assessHorse(horse, stageFor(horse, state.date), skill, state.date, rng);
  return { ok: true, assessment };
}
