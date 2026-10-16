/** M4-H12 게임 밸런스. 빈도는 임상 통계가 아닌 상대 가중치이며 전체 발생률은 conditioning 을 따른다. */
import type { Going, InjuryKind, InjuryRegion, InjuryTreatment, PermanentInjuryEffect } from '../types';

/** 사용자 결정 '현실 수준': 출주 중 중증 골절의 약 40%가 예후불량이다(M4-E0). */
export const CATASTROPHIC_FRACTURE_SHARE = 0.4;

export interface InjuryTreatmentDef {
  cost: number;
  weeksMult: number;
  recurMult: number;
  permanentMult: number;
  successRate: number;
  minWeeks?: number;
  maxWeeks?: number;
}
export interface InjuryKindDef {
  region: InjuryRegion;
  trainingWeight: number;
  racingWeight: number;
  minWeeks: number;
  maxWeeks: number;
  recurMult: number;
  permanentChance: number;
  permanent: PermanentInjuryEffect;
  subtle: boolean;
  treatments: Partial<Record<InjuryTreatment, InjuryTreatmentDef>>;
}

// 휴양은 무료·무보정. 의료·수술은 종류별로 기간/재발/후유증을 줄이는 게임 내 선택지다.
const rest: InjuryTreatmentDef = { cost: 0, weeksMult: 1, recurMult: 1, permanentMult: 1, successRate: 1 };
const medical = (cost: number, weeksMult: number, recurMult = 1, permanentMult = 1): InjuryTreatmentDef =>
  ({ cost, weeksMult, recurMult, permanentMult, successRate: 1 });
const surgery = (cost: number, weeksMult: number, permanentMult: number, successRate: number): InjuryTreatmentDef =>
  ({ cost, weeksMult, recurMult: 1, permanentMult, successRate });

export const INJURY_KINDS: Record<InjuryKind, InjuryKindDef> = {
  // 아주 흔한 가벼운 타박상에 최대 가중치 55, 후유증 없음.
  knock: { region: 'general', trainingWeight: 55, racingWeight: 55, minWeeks: 1, maxWeeks: 3,
    recurMult: 1.2, permanentChance: 0, permanent: {}, subtle: false, treatments: { rest } },
  // 성장기 골막통: 흔함 12, 성마는 타박상으로 치환한다.
  sore_shins: { region: 'bone', trainingWeight: 12, racingWeight: 12, minWeeks: 3, maxWeeks: 6,
    recurMult: 1.2, permanentChance: 0, permanent: {}, subtle: false, treatments: { rest } },
  // 피로 골절은 보통 4, 보존 치료로 재활 기간을 20% 줄인다.
  stress_fracture: { region: 'bone', trainingWeight: 4, racingWeight: 4, minWeeks: 8, maxWeeks: 16,
    recurMult: 1.8, permanentChance: 0, permanent: {}, subtle: true,
    treatments: { rest, medical: medical(2500, 0.8) } },
  // 골편은 관절경 수술 시 기간·스피드 손실 위험을 줄인다.
  chip_fracture: { region: 'joint', trainingWeight: 4, racingWeight: 4, minWeeks: 10, maxWeeks: 20,
    recurMult: 1.8, permanentChance: 0.35, permanent: { speed: 2 }, subtle: true,
    treatments: { rest, surgery: surgery(6000, 0.65, 0.25, 0.9) } },
  // 큰 골절은 드묾 1, 긴 재활과 큰 후유증·AI 은퇴 위험을 갖는다.
  fracture: { region: 'bone', trainingWeight: 1, racingWeight: 1, minWeeks: 30, maxWeeks: 52,
    recurMult: 2.5, permanentChance: 0.8, permanent: { speed: 10, stamina: 8 }, subtle: false,
    treatments: { rest, surgery: surgery(18000, 0.8, 0.5, 0.75) } },
  // 만성 관절통: 높은 재발과 폼 기복, 주사는 기간만 줄인다.
  joint: { region: 'joint', trainingWeight: 4, racingWeight: 4, minWeeks: 4, maxWeeks: 10,
    recurMult: 2.5, permanentChance: 0.5, permanent: { formVariance: 0.015 }, subtle: true,
    treatments: { rest, medical: medical(1200, 0.6) } },
  // 건 손상은 최장 재활·매우 높은 재발, 줄기세포 치료의 주효과는 재발 감소다.
  tendon: { region: 'tendon', trainingWeight: 4, racingWeight: 4, minWeeks: 26, maxWeeks: 52,
    recurMult: 4, permanentChance: 0.65, permanent: { speed: 8, stamina: 8 }, subtle: true,
    treatments: { rest, medical: medical(9000, 0.9, 0.4, 0.8) } },
  // 계인대 손상은 건 손상보다 짧고 후유증이 작다.
  suspensory: { region: 'tendon', trainingWeight: 4, racingWeight: 4, minWeeks: 12, maxWeeks: 30,
    recurMult: 2.5, permanentChance: 0.3, permanent: { speed: 2, stamina: 2 }, subtle: true,
    treatments: { rest, medical: medical(4500, 0.8, 0.6, 0.7) } },
  // 발굽 문제는 흔함 12, 장제로 복귀 기간을 절반으로 줄인다.
  foot: { region: 'foot', trainingWeight: 12, racingWeight: 12, minWeeks: 1, maxWeeks: 6,
    recurMult: 1.8, permanentChance: 0, permanent: {}, subtle: false,
    treatments: { rest, medical: medical(600, 0.5) } },
  // 운동성 출혈은 출주 중에만 발생하며 반복 시 폼이 불안정해진다.
  bleeding: { region: 'respiratory', trainingWeight: 0, racingWeight: 4, minWeeks: 2, maxWeeks: 6,
    recurMult: 2.5, permanentChance: 0.5, permanent: { formVariance: 0.02 }, subtle: false, treatments: { rest } },
  // 호흡기 감염은 흔함 12, 겨울 가중치는 별도 상수로 적용한다.
  respiratory: { region: 'respiratory', trainingWeight: 12, racingWeight: 12, minWeeks: 2, maxWeeks: 4,
    recurMult: 1.2, permanentChance: 0, permanent: {}, subtle: false,
    treatments: { rest, medical: medical(800, 0.5) } },
  // 후두 문제는 지속적 스태미나 손실, 타이백 성공 시 손실을 없애고 8~12주 재활한다.
  laryngeal: { region: 'respiratory', trainingWeight: 1, racingWeight: 1, minWeeks: 1, maxWeeks: 2,
    recurMult: 5, permanentChance: 1, permanent: { stamina: 8 }, subtle: true,
    treatments: { rest, surgery: { ...surgery(7500, 1, 0, 0.8), minWeeks: 8, maxWeeks: 12 } } },
  // 산통은 드묾 1, 휴양만으로 진행 가능하지만 선택 가능한 처치는 의료·수술뿐이다.
  colic: { region: 'digestive', trainingWeight: 1, racingWeight: 1, minWeeks: 1, maxWeeks: 4,
    recurMult: 1.2, permanentChance: 0, permanent: {}, subtle: false,
    treatments: { medical: medical(1800, 0.75), surgery: surgery(14000, 1, 1, 0.9) } },
  // 근육 경련은 높은 재발, 관리 조정으로 재발 위험을 줄인다.
  tying_up: { region: 'muscle', trainingWeight: 4, racingWeight: 4, minWeeks: 1, maxWeeks: 3,
    recurMult: 2.5, permanentChance: 0, permanent: {}, subtle: false,
    treatments: { rest, medical: medical(1000, 0.7, 0.4) } },
};

/** 최근 3년의 같은 부위 병력만 재발 위험에 반영하고 최근 20건만 보존한다. */
export const INJURY_RECUR_YEARS = 3;
export const INJURY_HISTORY_LIMIT = 20;
/** 검사비는 가벼운 처치보다 낮게, 3주 지연 확진은 남은 재활을 25% 늘린다. */
export const VET_EXAM_COST = 300;
export const INJURY_AUTO_DIAGNOSE_WEEKS = 3;
export const INJURY_LATE_DIAGNOSIS_MULT = 1.25;
/** 단단한 마장은 골·관절·발굽, 무른 마장은 건·근육 손상을 50% 가중한다. */
export const INJURY_GOING_MULT: Partial<Record<Going, Partial<Record<InjuryRegion, number>>>> = {
  firm: { bone: 1.5, joint: 1.5, foot: 1.5 },
  good_to_firm: { bone: 1.5, joint: 1.5, foot: 1.5 },
  soft: { tendon: 1.5, muscle: 1.5 },
  soft_to_heavy: { tendon: 1.5, muscle: 1.5 },
  heavy: { tendon: 1.5, muscle: 1.5 },
};
/** 겨울(11~3월) 감염 가중치 1.5: 흔함 범주를 유지하면서 계절 차이를 낸다. */
export const INJURY_WINTER_MONTHS: readonly number[] = [11, 12, 1, 2, 3];
export const INJURY_WINTER_RESPIRATORY_MULT = 1.5;
/** 중증 골절 AI 은퇴 50%, 산통 사망은 무처치 3% → 투약 1% → 수술 0.3%. */
export const INJURY_FRACTURE_AI_RETIRE_CHANCE = 0.5;
export const COLIC_DEATH_CHANCE: Record<InjuryTreatment, number> = { rest: 0.03, medical: 0.01, surgery: 0.003 };
