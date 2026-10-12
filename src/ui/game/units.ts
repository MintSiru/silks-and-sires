/**
 * 부담중량 표시 단위. 엔진 값은 항상 lb(정수)이고, 이 모듈은 화면 표시에만 쓴다.
 * 순수 함수만 둔다(DOM·저장소 접근 없음).
 */

/** 표시 단위: 파운드 또는 킬로그램 */
export type WeightUnit = 'lb' | 'kg';

/** 선택지 목록(화면 select 순서) */
export const WEIGHT_UNITS: readonly WeightUnit[] = ['lb', 'kg'];

/** 1lb 를 kg 로 바꾸는 계수 */
export const KG_PER_LB = 0.45359237;

/** kg 표기 단위(유럽·일본 경마 관례: 0.5kg 단위로 표기) */
export const KG_ROUNDING_STEP = 0.5;

const WEIGHT_UNIT_LABEL_KO: Record<WeightUnit, string> = {
  lb: '파운드(lb)',
  kg: '킬로그램(kg)',
};

/** 저장소 등 외부 입력이 유효한 단위인지 확인 */
export function isWeightUnit(value: unknown): value is WeightUnit {
  return value === 'lb' || value === 'kg';
}

/** lb → kg. 0.5kg 단위로 반올림한다. */
export function lbToKg(lb: number): number {
  const steps = Math.round((lb * KG_PER_LB) / KG_ROUNDING_STEP);
  return steps * KG_ROUNDING_STEP;
}

/** 부담중량 문자열. lb 는 "126lb", kg 는 정수면 "57kg", 아니면 "57.5kg". */
export function formatWeight(lb: number, unit: WeightUnit): string {
  if (unit === 'lb') return `${lb}lb`;
  const kg = lbToKg(lb);
  return Number.isInteger(kg) ? `${kg}kg` : `${kg.toFixed(1)}kg`;
}

/** 단위 선택지의 한국어 이름 */
export function weightUnitLabelKo(unit: WeightUnit): string {
  return WEIGHT_UNIT_LABEL_KO[unit];
}
