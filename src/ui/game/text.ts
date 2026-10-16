import type { NhStoreError } from '../../engine/sales/nhStore';
import type { StudRole } from '../../engine/types';
import type { RegisterHorseNameError } from '../../engine/naming/register';
import type { FarmNameError } from '../../engine/farm/naming';
import { BET_MIN_STAKE } from '../../engine/config/betting';
import type { BetError } from '../../engine/betting/betting';
import type { InjuryError } from '../../engine/horse/injury';
import type { BetKind } from '../../engine/types';
import type { SalePatronTier } from '../../engine/sales/patron';
import type { AcceptPrivateOfferError, InspectOfferError } from '../../engine/sales/privateTrade';
import commentsJson from '../../../data/text/comments.ko.json';
import { cyrb128 } from '../../engine/rng/hash';
import { relationTier, type RelationTier } from '../../engine/economy/relations';
import { formatDateKo } from '../../engine/time/calendar';
import type { BookingError } from '../../engine/breeding/season';
import type { RetainerRefusal } from '../../engine/economy/contracts';
import type { BidError } from '../../engine/sales/bidding';
import type { InspectError } from '../../engine/sales/inspection';
import type { ConsignError, UpcomingSale } from '../../engine/sales/player';
import { SALE_INSPECT_MIN_RELATION } from '../../engine/config/sales';
import type { TrainerReportKey } from '../../engine/horse/conditioning';
import type { PersonalityClueKey } from '../../engine/horse/personality';
import type { AssignTrainerError, DeclareError, WithdrawError } from '../../engine/season/player';
import {
  type AssessmentComment,
  type AssessmentStage,
  type CalendarPhaseId,
  type CommentKey,
  type CountryCode,
  type CoatColour,
  type DistanceProfile,
  type EconomyMode,
  type FaceMarking,
  type Grade,
  type GameEvent,
  type GrowthProfile,
  type HorseId,
  type HorseStatus,
  type FacilityKind,
  type FarmSize,
  type InjuryKind,
  type InjuryRegion,
  type InjuryTreatment,
  type LaurelCategory,
  type LeadingCategory,
  type LedgerCategory,
  type MatingPreview,
  type MatingRole,
  type Money,
  type NickLabel,
  type Race,
  type RaceKind,
  type SaleKind,
  type SaleLotResult,
  type Sex,
} from '../../engine/types';

/** 1 펄롱(furlong) 의 미터 값. 단위 환산이므로 밸런스 상수가 아니다. */
const METERS_PER_FURLONG = 201.168;
/** 펄롱 1개당 표기 단위 수(2 = 0.5 펄롱 단위로 반올림). */
const HALF_FURLONG_UNITS_PER_FURLONG = 2;

/** 코멘트 문장 표(data/text/comments.ko.json). 키가 빠지면 컴파일 오류가 난다. */
const COMMENT_SENTENCES: Record<CommentKey, readonly string[]> = commentsJson;

const GRADE_COLORS: Record<Grade, string> = {
  S: '#d4af37',
  A: '#2e8b57',
  B: '#20b2aa',
  C: '#808080',
  D: '#ff8c00',
  E: '#d62828',
};

const NICK_LABELS_KO: Record<NickLabel, string> = {
  excellent: '최상',
  good: '좋음',
  neutral: '보통',
  poor: '나쁨',
  unknown: '미확인',
};

const GROWTH_KO: Record<GrowthProfile['type'] | 'unknown', string> = {
  precocious: '조숙',
  normal: '보통',
  late: '만성',
  unknown: '미상',
};

const STAGE_KO: Record<AssessmentStage, string> = {
  foal: '망아지',
  yearling: '1세',
  two_year_old: '2세',
  in_training: '조교 중',
};

const STATUS_KO: Record<HorseStatus, string> = {
  foal: '망아지',
  weanling: '이유 망아지',
  yearling: '1세',
  in_training: '조교 중',
  resting: '휴양 중',
  retired: '은퇴',
  stud: '종마',
  broodmare: '번식 암말',
  dead: '폐사',
  historical: '과거 기록',
};

const PHASE_KO: Record<CalendarPhaseId, string> = {
  foaling: '출산 시기',
  breeding: '교배 시기',
  turf_flat: '잔디 평지 시즌',
  aw_winter: '올웨더 겨울 시즌',
};

/** 1000 단위 쉼표 표기. 소수는 반올림한다. */
function groupThousands(value: number): string {
  const digits = String(Math.round(Math.abs(value))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return value < 0 ? `-${digits}` : digits;
}

function assertNever(value: never): never {
  const kind = (value as { type?: unknown }).type;
  throw new Error(`알 수 없는 이벤트 종류: ${String(kind)}`);
}

/** 미터 → 펄롱 표기. 0.5 펄롱 단위로 반올림하고 .5 는 ½ 로 적는다(예: 6½f, 7f). */
function furlongLabel(meters: number): string {
  const units = Math.round((meters / METERS_PER_FURLONG) * HALF_FURLONG_UNITS_PER_FURLONG);
  const whole = Math.floor(units / HALF_FURLONG_UNITS_PER_FURLONG);
  const half = units % HALF_FURLONG_UNITS_PER_FURLONG === 1;
  return half ? `${whole}½f` : `${whole}f`;
}

/** 같은 seedKey 는 항상 같은 문장을 고른다(cyrb128 해시 기반, 난수 미사용). */
export function commentText(c: AssessmentComment, seedKey: string): string {
  const sentences = COMMENT_SENTENCES[c.key];
  if (sentences === undefined || sentences.length === 0) {
    throw new Error(`코멘트 문장이 없음: ${c.key}`);
  }
  const [hash] = cyrb128(seedKey);
  return sentences[hash % sentences.length] as string;
}

/** 등급 색(hex). S 금색, A 초록, B 청록, C 회색, D 주황, E 빨강. */
export function gradeColor(g: Grade): string {
  return GRADE_COLORS[g];
}

export function nickLabelKo(l: NickLabel): string {
  return NICK_LABELS_KO[l];
}

export function growthKo(g: GrowthProfile['type'] | 'unknown'): string {
  return GROWTH_KO[g];
}

const MATING_ROLE_KO: Record<MatingRole | 'unknown', string> = {
  speed: '스피드 담당',
  balanced: '균형형',
  stamina: '스태미나 담당',
  unknown: '미상',
};

/** 배합 역할 한국어. 예: 'speed' → '스피드 담당' */
export function matingRoleKo(r: MatingRole | 'unknown'): string {
  return MATING_ROLE_KO[r];
}

const COMPLEMENT_KO: Record<MatingPreview['complement'], string> = {
  likely: '보완형 배합 (부마 스피드 + 모계 스태미나)',
  unlikely: '보완형 아님',
  unknown: '판단 불가 (외조부 미상)',
};

/** 보완형(부 스피드 + 모계 스태미나) 가능성 한국어 */
export function complementKo(c: MatingPreview['complement']): string {
  return COMPLEMENT_KO[c];
}

/** 예: {min:1400,max:2000} → "1,400m ~ 2,000m (7f ~ 10f)" */
export function distanceHintKo(h: { min: number; max: number }): string {
  if (!Number.isFinite(h.min) || !Number.isFinite(h.max) || h.min > h.max) {
    throw new RangeError(`distanceHintKo: 잘못된 거리 범위: ${h.min}~${h.max}`);
  }
  const meters = `${groupThousands(h.min)}m ~ ${groupThousands(h.max)}m`;
  const furlongs = `${furlongLabel(h.min)} ~ ${furlongLabel(h.max)}`;
  return `${meters} (${furlongs})`;
}

/** 예: 60000 → "€60,000" */
export function feeKo(money: Money): string {
  return `€${groupThousands(money)}`;
}

export function stageKo(s: AssessmentStage): string {
  return STAGE_KO[s];
}

export function statusKo(s: HorseStatus): string {
  return STATUS_KO[s];
}

/** 달력 단계 한국어 이름. 예: 'breeding' → '교배 시기' */
export function phaseKo(p: CalendarPhaseId): string {
  return PHASE_KO[p];
}

const SEX_KO: Record<Sex, string> = { female: '암말', male: '수말' };
const GELDED_KO = '거세마';

/** 성별 한국어. 거세된 수말은 '거세마'. */
export function sexKo(sex: Sex, gelded: boolean): string {
  if (sex === 'male' && gelded) return GELDED_KO;
  return SEX_KO[sex];
}

const COAT_COLOUR_KO: Record<CoatColour, string> = {
  bay: '갈색(베이)',
  brown: '흑갈색',
  black: '흑색',
  chestnut: '밤색',
  grey: '회색',
  roan: '조모',
};

/** 표시 털색 한국어. 예: 'chestnut' → '밤색' */
export function coatColourKo(c: CoatColour): string {
  return COAT_COLOUR_KO[c];
}

const FACE_MARKING_KO: Record<FaceMarking, string> = {
  none: '없음',
  star: '별',
  snip: '코끝 흰 점',
  stripe: '가는 줄',
  blaze: '넓은 흰 줄',
};

/** 얼굴 흰 반점 한국어. 예: 'blaze' → '넓은 흰 줄' */
export function faceMarkingKo(f: FaceMarking): string {
  return FACE_MARKING_KO[f];
}

/** 마체 평가 6항목(종합 제외 포함) 키. ConformationReport 에서 stage 를 뺀 키다. */
export type ConformationKey = 'overall' | 'frame' | 'hindquarters' | 'legs' | 'action' | 'temperament';

const CONFORMATION_KO: Record<ConformationKey, string> = {
  overall: '종합',
  frame: '체격',
  hindquarters: '후구',
  legs: '다리',
  action: '걸음',
  temperament: '기질',
};

/** 마체 평가 항목 한국어 라벨 */
export function conformationLabelKo(key: ConformationKey): string {
  return CONFORMATION_KO[key];
}

const BOOKING_ERROR_KO: Record<BookingError, string> = {
  not_breeding_season: '교배 시기가 아닙니다. 먼저 종부 시즌까지 진행하세요.',
  not_your_mare: '내 말이 아니라서 교배를 예약할 수 없습니다.',
  not_a_broodmare: '번식 암말이 아니라서 교배를 예약할 수 없습니다.',
  mare_too_young: '아직 교배하기에 어린 암말입니다.',
  already_pregnant: '이미 임신 중인 암말입니다.',
  already_covered: '이번 시즌에 이미 교배가 예약된 암말입니다.',
  stallion_not_available: '교배할 수 없는 종마입니다.',
  book_full: '이 종마의 이번 시즌 교배 두수가 가득 찼습니다.',
  private_stallion: '비공개 종마입니다. 그 마주와 관계가 더 가까워야 예약할 수 있습니다.',
  insufficient_funds: '자금이 부족해 종부료를 낼 수 없습니다.',
};

const DEBT_BOOKING_KO = '빚을 갚기 전에는 종부료를 낼 수 없습니다.';

/**
 * 교배 예약 실패 사유 → 한국어. inDebt 는 캐주얼 모드에서 빚이 남아 있는지(호출자가 state 로 계산해 넘긴다).
 * 빚이 있을 때의 자금 부족(insufficient_funds)은 '빚을 갚기 전에는…' 문구로 바꾼다.
 */
export function bookingErrorKo(e: BookingError, inDebt = false): string {
  if (e === 'insufficient_funds' && inDebt) return DEBT_BOOKING_KO;
  return BOOKING_ERROR_KO[e];
}

// ── 경제 화면(M4-A4) ────────────────────────────────────────────

const LEDGER_CATEGORY_KO: Record<LedgerCategory, string> = {
  prize: '레이스 상금',
  series_bonus: '시리즈 보너스',
  stud_fee_paid: '종부료 지출',
  stud_fee_received: '종부료 수입',
  training_fee: '조교료',
  farm_upkeep: '목장 유지비',
  entry_fee: '출주 등록료',
  transport: '원정 운송비',
  retainer_fee: '전속 계약료',
  betting: '베팅',
  sale_purchase: '세일 구매',
  sale_proceeds: '세일 판매',
  sale_commission: '세일 수수료',
  private_sale: '개인 거래',
  stallion_sale: '종마 판매',
  stud_lease: '종마 임대료',
  vet_fee: '수의 비용',
  farm_purchase: '목장 구매',
  facility: '목장 시설',
  nh_store_sale: 'NH 스토어 세일',
  interest: '빚 이자',
  other: '기타',
};

/** 장부 종류 한국어. 예: 'farm_upkeep' → '목장 유지비' */
export function ledgerCategoryKo(c: LedgerCategory): string {
  return LEDGER_CATEGORY_KO[c];
}

const ECONOMY_MODE_KO: Record<EconomyMode, string> = {
  casual: '캐주얼(파산 없음, 적자는 빚으로)',
  legacy: '레거시(연속 적자 시 파산)',
};

/** 경제 모드 한국어. 예: 'legacy' → '레거시(연속 적자 시 파산)' */
export function economyModeKo(m: EconomyMode): string {
  return ECONOMY_MODE_KO[m];
}

/** 자금 경고 문구(배너·경제 화면). weeksLeft 가 있으면 파산까지 남은 주를 붙인다. */
export function fundsWarningKo(w: { kind: 'debt' | 'negative' | 'bankrupt'; weeksLeft: number | null }): string {
  if (w.kind === 'bankrupt') return '파산 — 더 진행할 수 없습니다';
  if (w.kind === 'debt') {
    return '빚이 남아 있습니다. 자금이 넉넉해지면 자동으로 갚으며, 갚기 전에는 종부료를 낼 수 없습니다.';
  }
  return `자금이 마이너스입니다${w.weeksLeft === null ? '' : ` (${w.weeksLeft}주 더 마이너스면 파산)`}`;
}

const COUNTRY_KO: Record<CountryCode, string> = {
  GB: '영국',
  IE: '아일랜드',
  FR: '프랑스',
  DE: '독일',
  IT: '이탈리아',
  JP: '일본',
  US: '미국',
  AU: '호주',
  HK: '홍콩',
  AE: '아랍에미리트',
  CA: '캐나다',
  AR: '아르헨티나',
  NZ: '뉴질랜드',
  ZA: '남아공',
  CL: '칠레',
};

/** 국가 코드 → 국가 한국어 명 */
export function countryKo(c: CountryCode): string {
  return COUNTRY_KO[c];
}

const RETAINER_CHANGE_KO: Record<'signed' | 'renewed' | 'declined' | 'lapsed' | 'terminated' | 'released', string> = {
  signed: '체결',
  renewed: '갱신',
  declined: '갱신 거절',
  lapsed: '만료',
  terminated: '해지',
  released: '갱신 안 함',
};

const PRIVATE_OFFER_CHANGE_KO: Record<'offered' | 'accepted' | 'declined' | 'expired', string> = {
  offered: '제안 도착',
  accepted: '구매',
  declined: '거절',
  expired: '제안 만료',
};

/** 세일 로트 결과 한 줄(플레이어 관점) */
function saleLotResultKo(role: 'buyer' | 'vendor' | 'underbidder', r: SaleLotResult): string {
  if (r.kind === 'withdrawn') return '출품 철회';
  if (r.kind === 'bought_back') return role === 'vendor' ? `유보가 미달 바이백 (최고 호가 ${feeKo(r.lastBid)})` : '유찰';
  if (role === 'buyer') return `낙찰 ${feeKo(r.price)}`;
  if (role === 'vendor') return `판매 ${feeKo(r.price)}`;
  return `다른 구매자에게 낙찰 ${feeKo(r.price)}`;
}

/** 이벤트 한 줄 요약. 말 이름은 nameOf 로 바꿔 넣는다. */
export function eventKo(e: GameEvent, nameOf: (id: HorseId) => string): string {
  switch (e.type) {
    case 'week_started':
      return `${formatDateKo(e.date)} 시작`;
    case 'new_year':
      return `${e.year}년이 시작되었습니다`;
    case 'phase_started':
      return `${formatDateKo(e.date)} · ${PHASE_KO[e.phase]} 시작`;
    case 'phase_ended':
      return `${formatDateKo(e.date)} · ${PHASE_KO[e.phase]} 종료`;
    case 'horse_status_changed':
      return `${nameOf(e.horseId)}: ${statusKo(e.from)} → ${statusKo(e.to)}`;
    case 'covering_booked':
      return `${formatDateKo(e.date)} · ${nameOf(e.mareId)} 교배 예약 (${nameOf(e.stallionId)}, 종부료 ${feeKo(e.fee)})`;
    case 'conception':
      return e.success
        ? `${formatDateKo(e.date)} · ${nameOf(e.mareId)} 수태 성공 (${nameOf(e.stallionId)})`
        : `${formatDateKo(e.date)} · ${nameOf(e.mareId)} 수태 실패`;
    case 'foal_born':
      return `${formatDateKo(e.date)} · ${nameOf(e.mareId)} 출산: ${nameOf(e.foalId)} (부 ${nameOf(e.stallionId)})`;
    case 'race_run':
      return `${formatDateKo(e.date)} · 레이스 결과: 우승 ${nameOf(e.winnerId)}`;
    case 'series_completed':
      return `${formatDateKo(e.date)} · 시리즈 달성: ${nameOf(e.horseId)}`;
    case 'nick_revealed':
      return `${formatDateKo(e.date)} · 닉스 확인: ${nameOf(e.horseId)} 의 그룹 우승으로 배합 궁합이 드러났습니다`;
    case 'awards_announced':
      return `${formatDateKo(e.date)} · ${e.year}년 시상·순위 발표`;
    case 'horse_injured':
      return `${formatDateKo(e.date)} · 부상: ${nameOf(e.horseId)} (${injuryKo(e.kind)}, 약 ${e.weeksOut}주)`;
    case 'injury_suspected':
      return `${formatDateKo(e.date)} · 이상 증세: ${nameOf(e.horseId)} — ${INJURY_REGION_HINT_KO[e.region]}`;
    case 'injury_diagnosed':
      return `${formatDateKo(e.date)} · 확진: ${nameOf(e.horseId)} (${injuryKo(e.kind)}, 약 ${e.weeksOut}주)`;
    case 'race_plan_declared':
      return `${formatDateKo(e.date)} · 계획대로 출주 신청: ${nameOf(e.horseId)}`;
    case 'race_plan_skipped':
      return `${formatDateKo(e.date)} · 출주 계획 취소: ${nameOf(e.horseId)} — ${e.reason}`;
    case 'mating_proposals_ready':
      return `${formatDateKo(e.date)} · 교배 제안 도착: ${e.season}년 시즌 번식 암말 ${e.count}두 — 번식 화면에서 검토`;
    case 'mating_proposal_skipped':
      return `${formatDateKo(e.date)} · 교배 예약 실패: ${nameOf(e.mareId)} — ${e.reason}`;
    case 'nh_store_sold':
      return `${formatDateKo(e.date)} · NH 스토어 세일: ${nameOf(e.horseId)} (${feeKo(e.price)})`;
    case 'horse_named':
      return `${formatDateKo(e.date)} · 이름 등록: ${e.name}${e.auto ? ' (자동 등록)' : ''}`;
    case 'farm_purchased':
      return `${formatDateKo(e.date)} · 목장 구매: ${COUNTRY_KO[e.country]} ${FARM_SIZE_KO[e.size]} 목장 (${feeKo(e.price)})`;
    case 'facility_upgraded':
      return `${formatDateKo(e.date)} · 시설 공사: ${FACILITY_KO[e.facility]} ${e.level}단계${e.cost > 0 ? ` (${feeKo(e.cost)})` : ''}`;
    case 'horse_fatally_injured':
      return `${formatDateKo(e.date)} · 예후불량: ${nameOf(e.horseId)} — 경주 중 치명적 부상`;
    case 'mare_lost_foal':
      return `${formatDateKo(e.date)} · 유산: ${nameOf(e.mareId)}`;
    case 'stud_ailment':
      return `${formatDateKo(e.date)} · ${e.ailment === 'laminitis' ? '제엽염' : '산통'}: ${nameOf(e.horseId)} — ${e.outcome === 'recovered' ? '회복' : e.outcome === 'retired' ? '은퇴' : '사망'}`;
    case 'injury_treated':
      return `${formatDateKo(e.date)} · 치료: ${nameOf(e.horseId)} — ${INJURY_TREATMENT_KO[e.treatment]}${e.cost > 0 ? ` (${feeKo(e.cost)})` : ''}, 복귀까지 약 ${e.weeksOut}주`;
    case 'economy_warning':
      return e.kind === 'debt_started'
        ? `${formatDateKo(e.date)} · 자금이 바닥나 빚이 생겼습니다`
        : `${formatDateKo(e.date)} · 자금이 마이너스입니다${e.weeksLeft === null ? '' : ` (${e.weeksLeft}주 뒤 파산)`}`;
    case 'bankrupt':
      return `${formatDateKo(e.date)} · 파산했습니다`;
    case 'horse_sold':
      return `${formatDateKo(e.date)} · 매각: ${nameOf(e.horseId)} (${feeKo(e.price)})`;
    case 'bet_settled':
      return `${formatDateKo(e.date)} · 베팅 정산: ${nameOf(e.horseId)} — ${e.returned > 0 ? `${feeKo(e.returned)} 회수 (건 돈 ${feeKo(e.outlay)})` : `${feeKo(e.outlay)} 잃음`}`;
    case 'private_offer':
      return `${formatDateKo(e.date)} · 내부거래 ${PRIVATE_OFFER_CHANGE_KO[e.change]}: ${nameOf(e.horseId)} (${feeKo(e.price)})`;
    case 'stallion_subfertile':
      return `${formatDateKo(e.date)} · 저수태 판명: ${nameOf(e.stallionId)} (수태율 약 ${Math.round(e.fertility * 100)}%)`;
    case 'stallion_fertility_warning':
      return `${formatDateKo(e.date)} · 수태율 경고: ${nameOf(e.stallionId)} 최근 관측 수태율 ${Math.round(e.rate * 100)}% — 은퇴를 검토하세요`;
    case 'stallion_pensioned':
      return `${formatDateKo(e.date)} · 종마 은퇴: ${nameOf(e.stallionId)}${e.reason === 'fertility' ? ' (저수태)' : e.reason === 'age' ? ' (고령)' : ''}`;
    case 'horse_died':
      return `${formatDateKo(e.date)} · 사망: ${nameOf(e.horseId)} (${e.cause === 'age' ? '노령' : e.cause === 'accident' ? '사고' : '질병'})`;
    case 'stud_fee_set':
      return `${formatDateKo(e.date)} · ${e.season} 시즌 종부료: ${nameOf(e.stallionId)} ${feeKo(e.prevFee)} → ${feeKo(e.fee)}`;
    case 'stud_season_settled':
      return `${formatDateKo(e.date)} · ${e.year}년 종부 정산: ${nameOf(e.stallionId)} — 외부 교배 ${e.outsideCovers}두, 수태 ${e.conceptions}두, 종부료 수입 ${feeKo(e.income)}`;
    case 'stallion_sold':
      return `${formatDateKo(e.date)} · 종마 ${e.mode === 'domestic' ? '국내' : '해외'} 판매: ${nameOf(e.horseId)} ${feeKo(e.price)}${e.nominations > 0 ? ` (교배권 시즌당 ${e.nominations}개 보유)` : ''}`;
    case 'stallion_leased':
      return `${formatDateKo(e.date)} · 종마 ${e.kind === 'shuttle' ? '셔틀' : '장기'} 임대: ${nameOf(e.horseId)} (${e.returnSeason} 시즌 복귀, 임대료 ${feeKo(e.rent)}${e.kind === 'long' ? '/년' : ''})`;
    case 'stud_lease_paid':
      return `${formatDateKo(e.date)} · 종마 임대료 수령: ${nameOf(e.horseId)} ${feeKo(e.rent)}${e.returned ? ' — 복귀' : ''}`;
    case 'sale_catalogue_published':
      return `${formatDateKo(e.date)} · 세일 카탈로그 발표 (${e.lots}개 로트)`;
    case 'sale_lot_result':
      return `${formatDateKo(e.date)} · 세일 결과: ${nameOf(e.horseId)} — ${saleLotResultKo(e.role, e.result)}`;
    case 'retainer_changed':
      return `${formatDateKo(e.date)} · 전속 ${e.kind === 'trainer' ? '조교사' : '기수'} 계약 ${RETAINER_CHANGE_KO[e.change]}${e.fee > 0 ? ` (${feeKo(e.fee)})` : ''}`;
    default:
      return assertNever(e);
  }
}

/** 부상 종류 한국어 */
/** 확진 전 조교사 단서(부위별) */
export const INJURY_REGION_HINT_KO: Record<InjuryRegion, string> = {
  general: '몸 상태가 조금 무거워 보인다고 합니다',
  bone: '조금 저는 것 같다고 합니다',
  joint: '관절이 부어 보인다고 합니다',
  tendon: '다리에 열감이 있다고 합니다',
  foot: '발을 디딜 때 불편해한다고 합니다',
  respiratory: '숨소리가 거칠다고 합니다',
  digestive: '사료를 잘 먹지 않는다고 합니다',
  muscle: '근육이 굳어 보인다고 합니다',
};

/** 목장 규모 한국어 */
export const FARM_SIZE_KO: Record<FarmSize, string> = { small: '소형', medium: '중형', large: '대형' };

/** 시설 이름 한국어 */
export const FACILITY_KO: Record<FacilityKind, string> = {
  paddock: '방목지', pool: '수영장', hill_gallop: '언덕 코스', indoor_school: '실내 마장',
  vet_clinic: '검사 설비', stallion_barn: '종마사', stable_block: '마방 증축',
  yearling_complex: '육성 시설', foaling_unit: '산실',
};

/** 치료 선택 한국어 */
export const INJURY_TREATMENT_KO: Record<InjuryTreatment, string> = {
  rest: '휴양', medical: '치료', surgery: '수술',
};

export function injuryKo(kind: InjuryKind): string {
  switch (kind) {
    case 'knock':
      return '타박';
    case 'sore_shins':
      return '정강이 통증';
    case 'stress_fracture':
      return '피로 골절';
    case 'chip_fracture':
      return '관절 내 골편';
    case 'fracture':
      return '중증 골절';
    case 'joint':
      return '관절염';
    case 'tendon':
      return '굴건염';
    case 'suspensory':
      return '현수인대염';
    case 'foot':
      return '발굽 손상';
    case 'bleeding':
      return '폐출혈';
    case 'respiratory':
      return '호흡기 감염';
    case 'laryngeal':
      return '후두 이상';
    case 'colic':
      return '산통';
    case 'tying_up':
      return '근육 경련';
    default:
      return assertNever(kind);
  }
}

/** 부상 검사·치료 실패 사유 → 한국어(M4-H4) */
export function injuryErrorKo(error: InjuryError): string {
  return {
    not_found: '말을 찾을 수 없습니다.',
    not_player_horse: '내 말이 아니라서 처치할 수 없습니다.',
    no_injury: '지금 부상 중인 말이 아닙니다.',
    already_diagnosed: '이미 확진된 부상입니다.',
    not_diagnosed: '검사를 받아 확진한 뒤에 치료를 고를 수 있습니다.',
    not_allowed: '이 부상에는 고를 수 없는 치료입니다.',
    already_treated: '이미 치료를 골랐습니다.',
    insufficient_funds: '자금이 부족해 실행할 수 없습니다.',
  }[error];
}

// ── 시즌 화면(M3-D3a) ───────────────────────────────────────────

/** 조교사 코멘트(조교사가 말하는 말투). 상태 단서 키 → 문구 */
const TRAINER_REPORT_KO: Record<TrainerReportKey, string> = {
  injured: '다리를 다쳐서 조교를 쉬고 있습니다. 회복을 지켜보겠습니다.',
  tired: '피로가 많이 쌓였습니다. 당분간 가볍게 풀어 주는 편이 좋겠습니다.',
  flat: '요즘 기운이 없어 보입니다. 마음을 다잡아 줄 시간이 필요합니다.',
  backward: '아직 많이 늦된 편입니다. 조교를 좀 더 쌓아야 합니다.',
  needs_run: '한 번 뛰어 봐야 감이 올 것 같습니다.',
  nearly_ready: '거의 준비가 됐습니다. 실전 한두 번이면 충분할 것 같습니다.',
  peak: '컨디션이 최고입니다. 언제 나가도 좋습니다.',
};

/** 조교사 코멘트 문구. 예: 'needs_run' → "한 번 뛰어 봐야 감이 올 것 같습니다." */
export function trainerReportKo(key: TrainerReportKey): string {
  return TRAINER_REPORT_KO[key];
}

const PERSONALITY_CLUE_KO: Record<PersonalityClueKey, string> = {
  gate_nervous: '게이트에서 예민합니다',
  keen_going: '출발하면 앞으로 나가려는 기세가 강합니다',
  genuine: '경합이 붙으면 끝까지 버팁니다',
  quirky: '고집이 있어 지시를 따르지 않을 때가 있습니다',
  laid_back: '여유가 있고 침착합니다',
};

/** 성격 단서 문구(조교사·기수 코멘트). 예: 'gate_nervous' → "게이트에서 예민합니다" */
export function personalityClueKo(key: PersonalityClueKey): string {
  return PERSONALITY_CLUE_KO[key];
}

/**
 * OR → 레이팅 수준 문구(플레이어에게 OR 숫자를 보이지 않는다). 값이 below 미만인 첫 칸의 문구를 쓴다.
 * 표는 오름차순이며, 마지막 칸 이상은 G1 수준이다.
 */
const RATING_HINT_BANDS: readonly { below: number; label: string }[] = [
  { below: 60, label: '하위 핸디캡 수준' },
  { below: 80, label: '중위 핸디캡 수준' },
  { below: 95, label: '상위 핸디캡 수준' },
  { below: 105, label: '리스티드 수준' },
  { below: 115, label: '그룹 수준' },
];
const RATING_HINT_TOP = 'G1 수준';
const RATING_HINT_NONE = '아직 평가 전';

/** OR 을 숫자 없이 보이는 레이팅 수준 문구. null 은 '아직 평가 전'. */
export function ratingHintKo(or: number | null): string {
  if (or === null || !Number.isFinite(or)) return RATING_HINT_NONE;
  for (const band of RATING_HINT_BANDS) {
    if (or < band.below) return band.label;
  }
  return RATING_HINT_TOP;
}

const RACE_KIND_KO: Record<RaceKind, string> = {
  maiden: '메이든',
  novice: '노비스',
  handicap: '핸디캡',
  conditions: '조건',
  listed: '리스티드',
  group: '그룹',
};

/** 레이스 등급 표시. G1·G2·G3·리스티드, 등급 없는 레이스는 '종류 · 클래스 N'. 예: "핸디캡 · 클래스 4" */
export function raceGradeKo(race: Race): string {
  if (race.grade === 'L') return '리스티드';
  if (race.grade !== null) return race.grade;
  return `${RACE_KIND_KO[race.kind]} · 클래스 ${race.raceClass}`;
}

/** 레이스 거리 표시. 예: 1600 → "1,600m (8f)" */
export function raceDistanceKo(meters: number): string {
  if (!Number.isFinite(meters) || meters <= 0) {
    throw new RangeError(`raceDistanceKo: 잘못된 거리: ${meters}`);
  }
  return `${groupThousands(meters)}m (${furlongLabel(meters)})`;
}

const SEX_CONDITION_KO: Record<Race['conditions']['sex'], string> = {
  open: '암수 혼합',
  fillies_mares: '암말',
  colts_geldings: '수말·거세마',
};

const WEIGHT_SYSTEM_KO: Record<Race['conditions']['weightSystem'], string> = {
  wfa: 'WFA',
  handicap: '핸디캡',
  level: '동일 중량',
};

/** 핸디캡 OR 범위를 레이팅 수준 문구로 바꾼다(숫자 금지). */
function weightConditionKo(race: Race): string {
  const { ratingMin, ratingMax, weightSystem } = race.conditions;
  if (ratingMin !== null && ratingMax !== null) {
    return `핸디캡 · ${ratingHintKo(ratingMin)} ~ ${ratingHintKo(ratingMax)}`;
  }
  if (ratingMin !== null) return `핸디캡 · ${ratingHintKo(ratingMin)} 이상`;
  if (ratingMax !== null) return `핸디캡 · ${ratingHintKo(ratingMax)} 이하`;
  return WEIGHT_SYSTEM_KO[weightSystem];
}

/** 출주 조건 요약. 예: "3세 · 암말 · WFA", "2세 이상 · 암수 혼합 · 핸디캡 · 중위 핸디캡 수준 ~ 상위 핸디캡 수준" */
export function raceConditionsKo(race: Race): string {
  const c = race.conditions;
  let ageKo: string;
  if (c.maxAge === null) {
    ageKo = `${c.minAge}세 이상`;
  } else if (c.minAge === c.maxAge) {
    ageKo = `${c.minAge}세`;
  } else {
    ageKo = `${c.minAge}~${c.maxAge}세`;
  }
  return `${ageKo} · ${SEX_CONDITION_KO[c.sex]} · ${weightConditionKo(race)}`;
}

/** 출주 접수 실패 사유 → 한국어 */
const DECLARE_ERROR_KO: Record<DeclareError, string> = {
  unnamed: '이름을 등록해야 출주할 수 있습니다.',
  not_found: '개최 또는 레이스를 찾을 수 없습니다.',
  not_player_horse: '내 말이 아니라서 출주를 접수할 수 없습니다.',
  no_trainer: '조교사를 먼저 정해야 출주할 수 있습니다.',
  not_eligible: '이 레이스의 출주 조건에 맞지 않습니다.',
  race_closed: '출주 접수가 마감된 레이스입니다.',
  already_declared: '이번 주 다른 레이스에 이미 출주를 접수한 말입니다.',
  field_full: '출주 두수가 가득 찼습니다.',
};

export function declareErrorKo(e: DeclareError): string {
  return DECLARE_ERROR_KO[e];
}

const WITHDRAW_ERROR_KO: Record<WithdrawError, string> = {
  not_found: '개최 또는 레이스를 찾을 수 없습니다.',
  race_closed: '출주 접수가 마감되어 취소할 수 없습니다.',
  not_declared: '출주 접수된 말이 아닙니다.',
};

export function withdrawErrorKo(e: WithdrawError): string {
  return WITHDRAW_ERROR_KO[e];
}

const ASSIGN_TRAINER_ERROR_KO: Record<AssignTrainerError, string> = {
  not_found: '말을 찾을 수 없습니다.',
  not_player_horse: '내 말이 아니라서 조교사를 정할 수 없습니다.',
  trainer_not_found: '조교사를 찾을 수 없습니다.',
  invalid_status: '지금은 조교사를 정할 수 없는 상태입니다.',
  trainer_full: '이 조교사는 수용 두수가 가득 찼습니다.',
};

/** 조교사 배정 실패 사유 → 한국어 */
export function assignTrainerErrorKo(e: AssignTrainerError): string {
  return ASSIGN_TRAINER_ERROR_KO[e];
}

// ── 순위·시상 화면(M3-D3c) ──────────────────────────────────────

const LAUREL_CATEGORY_KO: Record<LaurelCategory, string> = {
  horse_of_the_year: '올해의 말',
  older_horse: '최우수 고령마',
  stayer: '최우수 장거리마',
  sprinter: '최우수 단거리마',
  two_year_old_colt: '최우수 2세 수말',
  two_year_old_filly: '최우수 2세 암말',
  three_year_old_colt: '최우수 3세 수말',
  three_year_old_filly: '최우수 3세 암말',
};

/** Laurel 시상 부문명 한국어. 예: 'stayer' → '최우수 장거리마' (수말은 거세마 포함) */
export function laurelCategoryKo(c: LaurelCategory): string {
  return LAUREL_CATEGORY_KO[c];
}

const LEADING_CATEGORY_KO: Record<LeadingCategory, string> = {
  sire: '종마(부)',
  damsire: '외조부',
  jockey: '기수',
  trainer: '조교사',
  owner: '마주',
  breeder: '생산자',
};

/** 리딩 카테고리 한국어. 예: 'sire' → '종마(부)' */
export function leadingCategoryKo(c: LeadingCategory): string {
  return LEADING_CATEGORY_KO[c];
}

/** 가상 시리즈 이름(id 기준). data/calendar/series.json 의 15개 전부. 모르는 id 는 id 그대로 돌려준다. */
const SERIES_NAME_KO: Record<string, string> = {
  gb_triple_crown: '영국 3관',
  ie_triple_crown: '아일랜드 3관',
  fr_triple_crown: '프랑스 3관',
  de_triple_crown: '독일 3관',
  it_triple_crown: '이탈리아 3관',
  gb_tiara: '영국 티아라',
  ie_tiara: '아일랜드 티아라',
  fr_tiara: '프랑스 티아라',
  de_tiara: '독일 티아라',
  it_tiara: '이탈리아 티아라',
  european_derby_triple: '유럽 더비 3연관',
  european_mile_triple: '유럽 마일 3연관',
  british_oaks_triple: '영국 오크스 3연관',
  european_stayers_series: '유럽 스테이어 시리즈',
  european_sprint_series: '유럽 스프린트 포인트 시리즈',
};

/** 시리즈 이름 한국어. 예: 'gb_triple_crown' → '영국 3관' */
export function seriesNameKo(seriesId: string): string {
  return SERIES_NAME_KO[seriesId] ?? seriesId;
}

const DISTANCE_PROFILE_KO: Record<DistanceProfile, string> = {
  speed: '스피드형(단거리)',
  classic: '클래식형(마일·중거리)',
  middle: '중장거리형',
  cup: '스테이어형(장거리)',
};

/** 거리 적성 한국어. 예: 'cup' → '스테이어형(장거리)' */
export function distanceProfileKo(p: DistanceProfile): string {
  return DISTANCE_PROFILE_KO[p];
}

const RELATION_TIER_KO: Record<RelationTier, string> = {
  cold: '냉랭',
  cool: '서먹',
  neutral: '보통',
  warm: '우호',
  close: '친밀',
  trusted: '신뢰',
};

/** 관계값(−100 ~ 100) 등급 한국어. 예: 45 → '친밀' */
export function relationTierKo(value: number): string {
  return RELATION_TIER_KO[relationTier(value)];
}

// ── 세일·인맥 화면(M4-C10a) ─────────────────────────────────────

const SALE_KIND_KO: Record<SaleKind, string> = {
  foal: '이유마 세일',
  yearling: '1세마 세일',
  breeze_up: '2세 브리즈업 세일',
  horses_in_training: '현역마 세일',
  breeding_stock: '번식마 세일',
};

/** 세일 종류 한국어. 예: 'yearling' → '1세마 세일' */
export function saleKindKo(kind: SaleKind): string {
  return SALE_KIND_KO[kind];
}

const CONSIGN_ERROR_KO: Record<ConsignError, string> = {
  sale_not_found: '세일을 찾을 수 없습니다.',
  not_found: '말을 찾을 수 없습니다.',
  not_player_horse: '내 말이 아니라서 위탁할 수 없습니다.',
  wrong_kind: '이 세일의 출품 조건(나이·상태)에 맞지 않는 말입니다.',
  too_late: '카탈로그 발표 주가 지나 위탁을 받지 않습니다.',
  already_consigned: '이미 위탁했거나 카탈로그에 올라간 말입니다.',
  invalid_reserve: '유보가는 0 이상의 정수여야 합니다.',
};

/** 위탁 실패 사유 → 한국어 */
export function consignErrorKo(e: ConsignError): string {
  return CONSIGN_ERROR_KO[e];
}

const BID_ERROR_KO: Record<BidError, string> = {
  catalogue_not_found: '카탈로그가 아직 발표되지 않았습니다.',
  lot_not_found: '로트를 찾을 수 없습니다.',
  lot_closed: '이미 마감된 로트입니다.',
  own_lot: '내 위탁 로트에는 입찰할 수 없습니다.',
  invalid_amount: '입찰 상한이 최저 호가보다 낮거나 올바른 금액이 아닙니다.',
  insufficient_funds: '자금이 부족해 이 상한으로 입찰할 수 없습니다.',
  too_late: '판매 주가 지나 입찰할 수 없습니다.',
  mare_capacity: '번식 암말이 목장 수용 한도에 찼습니다. 목장 화면에서 마방을 늘리거나 더 큰 목장으로 옮기세요.',
};

/** 입찰 상한 실패 사유 → 한국어 */
export function bidErrorKo(e: BidError): string {
  return BID_ERROR_KO[e];
}

/** 전속 제의·체결·해지 실패 사유(해지의 not_contracted 포함) */
export type RetainerActionError = RetainerRefusal | 'insufficient_funds' | 'not_contracted';

const RETAINER_REFUSAL_KO: Record<RetainerActionError, string> = {
  not_found: '사람을 찾을 수 없습니다.',
  retired: '은퇴한 사람은 전속으로 둘 수 없습니다.',
  already_contracted: '이미 전속 계약 중입니다.',
  slot_full: '이 종류의 전속 자리가 가득 찼습니다.',
  retained_elsewhere: '다른 마주와 전속 계약 중인 기수입니다.',
  relation_too_low: '관계가 부족해 전속을 제의할 수 없습니다.',
  standing_too_low: '내 위상이 부족해 이 사람이 응하지 않습니다.',
  insufficient_funds: '자금이 부족해 계약금을 낼 수 없습니다.',
  not_contracted: '전속 계약 중인 사람이 아닙니다.',
};

/** 전속 계약 제의 거절·체결 실패·해지 실패 사유 → 한국어 */
export function retainerRefusalKo(e: RetainerActionError): string {
  return RETAINER_REFUSAL_KO[e];
}

const SALE_STATUS_KO: Record<UpcomingSale['status'], string> = {
  upcoming: '발표 전',
  catalogued: '카탈로그 발표',
  closed: '마감',
};

/** 세일 일정 상태 한국어. 예: 'catalogued' → '카탈로그 발표' */
export function saleStatusKo(s: UpcomingSale['status']): string {
  return SALE_STATUS_KO[s];
}

// ── 세일·인맥 화면 안내 문구(M4-C10b) ───────────────────────────

const INSPECT_ERROR_KO: Record<InspectError, string> = {
  catalogue_not_found: '카탈로그가 아직 발표되지 않았습니다.',
  lot_not_found: '로트를 찾을 수 없습니다.',
  lot_closed: '마감된 로트는 검사할 수 없습니다.',
  horse_missing: '말 정보를 찾을 수 없습니다.',
  not_eligible: '이 조교사는 동행 검사를 할 수 없습니다.',
};

/** 조교사 검사 실패 사유 → 한국어 */
export function inspectErrorKo(e: InspectError): string {
  return INSPECT_ERROR_KO[e];
}

/** 동행 검사 가능한 조교사가 없을 때의 안내. 기준 관계값은 config 를 따른다 */
export function inspectNoneKo(): string {
  return `전속 조교사나 관계 ${SALE_INSPECT_MIN_RELATION} 이상 조교사가 있어야 검사할 수 있습니다`;
}

/** 발표 전 세일 안내. 예: '발표 전 — 12주에 발표' (세일 연도가 다르면 연도를 붙인다) */
export function saleAnnounceKo(year: number, currentYear: number, announceWeek: number): string {
  const when = year === currentYear ? `${announceWeek}주` : `${year}년 ${announceWeek}주`;
  return `발표 전 — ${when}에 발표`;
}

/** 로트 최저 호가 안내 */
export function bidMinimumKo(minimum: Money): string {
  return `최저 호가 ${feeKo(minimum)}`;
}

/** 실시간 보기가 판매 주가 아닐 때의 안내. dateKo 는 판매 주 표기(formatDateKo) */
export function liveClosedKo(dateKo: string): string {
  return `실시간 보기는 판매 주(${dateKo})에만 열립니다.`;
}

/** 실시간 보기 하단 고정 안내: 실제 결과는 다음 주 진행 때 확정된다 */
export function liveFinalNoticeKo(): string {
  return '실제 결과는 다음 주 진행 때 확정됩니다.';
}

/** 입찰 상한 취소 실패(상한이 없음) */
export function clearBidErrorKo(): string {
  return '취소할 입찰 상한이 없습니다.';
}

/** 발표 전 위탁 취소 실패(카탈로그에 올라간 말은 취소할 수 없다) */
export function consignWithdrawErrorKo(): string {
  return '발표 전 위탁만 취소할 수 있습니다. 카탈로그에 올라간 말은 취소할 수 없습니다.';
}

/** 전속 계약 체결 확인 대화 문구. feeText 는 feeKo 로 만든 계약금 표기 */
export function signConfirmKo(feeText: string): string {
  return `계약금 ${feeText} 을 내고 전속 계약을 맺습니다. 계속할까요?`;
}

/** 전속 계약 해지 확인 대화 문구(위약금 안내) */
export function terminateConfirmKo(penalty: Money): string {
  return `해지하면 위약금 ${feeKo(penalty)} 을 내고, 이 사람과의 관계가 떨어집니다. 계속할까요?`;
}

/** 개인 거래 제안 실패 사유 → 한국어 */
export function privateOfferErrorKo(error: AcceptPrivateOfferError | InspectOfferError): string {
  return {
    offer_not_found: '개인 거래 제안을 찾을 수 없습니다.',
    offer_invalid: '기한이 지났거나 거래할 수 없는 제안입니다.',
    insufficient_funds: '자금이 부족해 구매할 수 없습니다.',
    not_eligible: '이 조교사는 동행 검사를 할 수 없습니다.',
  }[error];
}

export function patronTierKo(tier: SalePatronTier): string {
  return { none: '일반', silver: '실버', gold: '골드' }[tier];
}

const BET_ERROR_KO: Record<BetError, string> = {
  bookmaker_not_found: '베팅 회사를 찾을 수 없습니다.',
  race_not_found: '레이스를 찾을 수 없습니다.',
  race_closed: '베팅이 마감된 레이스입니다.',
  horse_not_declared: '출주 선언된 말을 고르세요.',
  invalid_stake: `베팅 금액은 최소 ${feeKo(BET_MIN_STAKE)} 이상의 정수여야 합니다.`,
  each_way_unavailable: '4두 이하 레이스에는 연승을 걸 수 없습니다.',
  over_limit: '이 레이스의 베팅 지출 한도를 초과했습니다.',
  insufficient_funds: '베팅할 자금이 부족합니다.',
};

export function betErrorKo(error: BetError): string {
  return BET_ERROR_KO[error];
}

export function betKindKo(kind: BetKind): string {
  return kind === 'win' ? '단승' : '연승';
}

export const FARM_NAME_ERROR_KO: Record<FarmNameError, string> = {
  too_short: '목장 이름은 2자 이상 입력하세요.',
  too_long: '목장 이름은 30자 이내로 입력하세요.',
  invalid_chars: "글자·공백·하이픈·아포스트로피·마침표만 사용할 수 있습니다.",
  taken: '다른 마주나 생산자가 쓰는 목장 이름입니다.',
  protected: '보호 이름이나 금지된 경마장 지명이 포함되어 있습니다.',
};

export const HORSE_NAME_ERROR_KO: Record<RegisterHorseNameError, string> = {
  not_found: '말을 찾을 수 없습니다.',
  not_player: '내 말만 이름을 등록할 수 있습니다.',
  already_registered: '이미 이름을 등록한 말입니다.',
  tooLong: '이름은 공백 포함 18자 이내로 입력하세요.',
  tooManySyllables: '이름은 7음절 이내로 입력하세요.',
  invalidChars: '영문자·단어 사이 공백·아포스트로피만 사용할 수 있습니다.',
  initialsOnly: '이니셜만으로는 등록할 수 없습니다.',
  endsWithNumber: '이름 끝에 숫자를 쓸 수 없습니다.',
  protected: '보호 이름이나 금지된 경마장 지명이 포함되어 있습니다.',
  taken: '다른 말이 쓰거나 후보로 예약한 이름입니다.',
};

export function studRoleKo(role: StudRole = 'flat'): string {
  return { flat: '평지', dual: '겸용', nh: 'NH' }[role];
}

export function nhStoreErrorKo(error: NhStoreError): string {
  return {
    not_store_week: 'NH 스토어 세일 기간이 아닙니다.', not_found: '말을 찾을 수 없습니다.',
    not_player_horse: '내 소유 말만 판매할 수 있습니다.', not_male: '수말·거세마만 판매할 수 있습니다.',
    wrong_age: '3~4세 말만 판매할 수 있습니다.', not_racing: '현역마만 판매할 수 있습니다.',
    consigned: '다른 세일 출품을 취소한 뒤 판매해 주세요.',
  }[error];
}
