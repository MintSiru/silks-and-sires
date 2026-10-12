import commentsJson from '../../../data/text/comments.ko.json';
import { cyrb128 } from '../../engine/rng/hash';
import { formatDateKo } from '../../engine/time/calendar';
import type { BookingError } from '../../engine/breeding/season';
import {
  type AssessmentComment,
  type AssessmentStage,
  type CalendarPhaseId,
  type CommentKey,
  type CountryCode,
  type CoatColour,
  type FaceMarking,
  type Grade,
  type GameEvent,
  type GrowthProfile,
  type HorseId,
  type HorseStatus,
  type InjuryKind,
  type MatingPreview,
  type MatingRole,
  type Money,
  type NickLabel,
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
  insufficient_funds: '자금이 부족해 종부료를 낼 수 없습니다.',
};

/** 교배 예약 실패 사유 → 한국어 */
export function bookingErrorKo(e: BookingError): string {
  return BOOKING_ERROR_KO[e];
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
};

/** 국가 코드 → 국가 한국어 명 */
export function countryKo(c: CountryCode): string {
  return COUNTRY_KO[c];
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
    case 'horse_injured':
      return `${formatDateKo(e.date)} · 부상: ${nameOf(e.horseId)} (${injuryKo(e.kind)}, 약 ${e.weeksOut}주)`;
    default:
      return assertNever(e);
  }
}

/** 부상 종류 한국어 */
export function injuryKo(kind: InjuryKind): string {
  switch (kind) {
    case 'knock':
      return '타박';
    case 'sore_shins':
      return '정강이 통증';
    case 'tendon':
      return '건 손상';
    case 'fracture':
      return '골절';
    default:
      return assertNever(kind);
  }
}
