/**
 * 인맥 화면 뷰 모델 (M4-C10a, 기수·조교사 능력 화면 M4-P1). 조교사·기수의 관계·전속 계약·제의 가능 여부와 명성 표시.
 * 프로필은 능력을 S~E 등급으로만 보여 주고, 원래 수치(0~100)는 결과에 넣지 않는다(사용자 결정 2026-10-15).
 * 순수 함수만 둔다.
 * 관계값은 소수 1자리로 보이고, 등급 문구는 text.ts 의 relationTierKo 를 쓴다.
 */
import {
  FACILITY_GRADE_MAX,
  FACILITY_GRADE_MIN,
  TRAINER_BIAS_STYLE_THRESHOLD,
  TRAINER_JUVENILE_STYLE_MIN,
} from '../../engine/config/people';
import { contractFor } from '../../engine/economy/contractQuery';
import { retainerQuote, type RetainerKind } from '../../engine/economy/contracts';
import { relationKey, relationOf } from '../../engine/economy/relations';
import { gradeOf } from '../../engine/horse/assessment';
import { ageInYear } from '../../engine/time/calendar';
import type {
  CountryCode,
  Grade,
  GameState,
  Money,
  PersonCareer,
  RunningStyle,
  TrainerStyle,
} from '../../engine/types';
import { feeKo, relationTierKo, retainerRefusalKo } from '../game/text';

/** 화면 표시 소수 자리(관계·명성). 밸런스 값이 아니라 표기 자리수다. */
const DISPLAY_DECIMALS = 1;
const DISPLAY_FACTOR = 10 ** DISPLAY_DECIMALS;
/** 퍼센트 환산(승률·입상률 표시) */
const PERCENT = 100;

/**
 * 명성 등급 표. below 미만인 첫 칸의 문구를 쓴다. 표에 없는 값은 TOP 문구.
 * 화면 문구의 구간이며 밸런스 상수가 아니다.
 */
const REPUTATION_BANDS: readonly { below: number; labelKo: string }[] = [
  { below: 20, labelKo: '무명' },
  { below: 40, labelKo: '신진' },
  { below: 60, labelKo: '중견' },
  { below: 80, labelKo: '유력' },
];
const REPUTATION_TOP_KO = '명문';

/**
 * 시설 등급(1~5) → 등급 문자. 화면 표기 대응표이며 밸런스 값이 아니다.
 * 명세: 1→E … 5→S. 가운데 칸(2~4)은 D·C·B 로 둔다(Opus 확인 대기).
 */
const FACILITY_LETTERS: readonly Grade[] = ['E', 'D', 'C', 'B', 'S'];

/** 잘 맞는 작전 문구(화면 표기) */
const PREFERRED_STYLE_KO: Record<RunningStyle, string> = {
  front: '선행',
  prominent: '선입',
  midfield: '중위',
  held_up: '추입',
};
const PREFERRED_STYLE_NONE_KO = '잘 맞는 작전 없음';

/** 조교사 성향 문구(화면 표기) */
const TRAINER_STYLE_KO: Record<TrainerStyle, string> = {
  early_juveniles: '2세 조기 출주형',
  patient: '신중형',
  sprinters: '단거리형',
  stayers: '장거리형',
  all_round: '전천후형',
};

export type StaffQuote = { ok: true; feeKo: string } | { ok: false; reasonKo: string };

/** 관계·전속·제의 상태(목록 행과 프로필이 같이 쓴다) */
export interface RelationView {
  /** 관계값(소수 1자리) */
  relation: number;
  tierKo: string;
  /** 전속이면 '전속 (2027년 말까지, 연 €92,000)', 아니면 null */
  contractKo: string | null;
  /** 계약 제의 가능 여부와 계약금 또는 거절 사유 */
  quote: StaffQuote;
}

export interface StaffRow extends RelationView {
  personId: string;
  name: string;
  country: CountryCode;
  age: number;
}

export interface StaffFilter {
  /** true 면 관계값이 있거나 전속인 사람만 */
  onlyKnown?: boolean;
}

export interface ReputationView {
  /** 명성(소수 1자리) */
  reputation: number;
  labelKo: string;
}

/** 등급 한 칸(능력 이름 + S~E). 원래 수치는 싣지 않는다 */
export interface GradeItem {
  labelKo: string;
  grade: Grade;
}

/** 성적 한 줄(올해·통산·합계 공통 형식). 출주가 0이면 비율은 null */
export interface StatLine {
  runners: number;
  wins: number;
  /** 승률(%, 소수 1자리). 출주 0이면 null */
  winRatePct: number | null;
  /** 입상률(%, 소수 1자리). 출주 0이면 null */
  placeRatePct: number | null;
  groupWins: number;
  /** 올해 G1 승은 집계하지 않으므로 올해 줄은 null */
  g1Wins: number | null;
  earnings: Money;
}

export interface CareerRecords {
  thisYear: StatLine;
  career: StatLine;
  total: StatLine;
}

export interface JockeyProfile {
  personId: string;
  name: string;
  country: CountryCode;
  age: number;
  /** 견습 여부(감량이 있으면 견습) */
  apprentice: boolean;
  /** 견습 감량(lb). 정식 기수는 0. 단위 표시는 화면에서 */
  apprenticeAllowanceLb: number;
  /** 최저 기승 체중(lb). 단위 표시는 화면에서 */
  minRidingWeightLb: number;
  /** 출발·페이스·마무리·힘·종합 */
  grades: GradeItem[];
  preferredStyleKo: string;
  records: CareerRecords;
  relation: RelationView;
}

export interface TrainerProfile {
  personId: string;
  name: string;
  country: CountryCode;
  age: number;
  yardName: string;
  region: string;
  /** 수용 두수 */
  capacity: number;
  /** 내 말 위탁 수 */
  ownedHorseCount: number;
  /** 조교·상마안·시설 */
  grades: GradeItem[];
  styleKo: string;
  /** 장거리·단거리 성향 문구 */
  staminaKo: string;
  /** 2세 조기 출주 성향 문구 */
  juvenileKo: string;
  records: CareerRecords;
  relation: RelationView;
}

/** 값을 화면 자리수로 반올림한다 */
function roundDisplay(value: number): number {
  return Math.round(value * DISPLAY_FACTOR) / DISPLAY_FACTOR;
}

/** 코드 포인트 순 비교(로케일에 따라 달라지지 않도록) */
function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

interface PersonRecord {
  id: string;
  name: string;
  country: CountryCode;
  birthYear: number;
}

function peopleOf(state: GameState, kind: RetainerKind): PersonRecord[] {
  if (kind === 'jockey') return Object.values(state.jockeys);
  return Object.values(state.trainers);
}

/** 관계·전속 상태. raw 는 정렬용 원래 관계값이며 화면에는 내보내지 않는다 */
function relationParts(state: GameState, kind: RetainerKind, personId: string): { raw: number; view: RelationView } {
  const contract = contractFor(state, kind, personId);
  const raw = relationOf(state, relationKey(kind, personId));
  const quote = retainerQuote(state, kind, personId);
  return {
    raw,
    view: {
      relation: roundDisplay(raw),
      tierKo: relationTierKo(raw),
      contractKo:
        contract === undefined
          ? null
          : `전속 (${contract.endYear}년 말까지, 연 ${feeKo(contract.annualFee)})`,
      quote: quote.ok
        ? { ok: true, feeKo: feeKo(quote.fee) }
        : { ok: false, reasonKo: retainerRefusalKo(quote.reason) },
    },
  };
}

/**
 * 조교사(kind 'trainer') 또는 기수('jockey') 목록. 정렬: 전속 → 관계값 내림차순 → 이름 → id.
 * onlyKnown 이면 관계값이 기록된 사람과 전속인 사람만 남긴다.
 */
export function staffRows(state: GameState, kind: RetainerKind, filter: StaffFilter = {}): StaffRow[] {
  const entries = peopleOf(state, kind).flatMap((person) => {
    const contracted = contractFor(state, kind, person.id) !== undefined;
    const hasValue = state.relations.values[relationKey(kind, person.id)] !== undefined;
    if (filter.onlyKnown === true && !hasValue && !contracted) return [];
    const { raw, view } = relationParts(state, kind, person.id);
    const row: StaffRow = {
      personId: person.id,
      name: person.name,
      country: person.country,
      age: ageInYear(person.birthYear, state.date.year),
      ...view,
    };
    return [{ row, raw, contracted }];
  });

  entries.sort(
    (a, b) =>
      Number(b.contracted) - Number(a.contracted) ||
      b.raw - a.raw ||
      compareText(a.row.name, b.row.name) ||
      compareText(a.row.personId, b.row.personId),
  );
  return entries.map((entry) => entry.row);
}

/** 명성 표시: 소수 1자리 값과 등급 문구(무명·신진·중견·유력·명문). 등급은 화면에 보이는 값으로 정한다. */
export function reputationView(state: GameState): ReputationView {
  const shown = roundDisplay(state.relations.reputation);
  const band = REPUTATION_BANDS.find((b) => shown < b.below);
  return {
    reputation: shown,
    labelKo: band === undefined ? REPUTATION_TOP_KO : band.labelKo,
  };
}

// ── 프로필 ─────────────────────────────────────────────────────

/** 시설 등급(정수) → 등급 문자. 범위 밖이면 가장 가까운 칸으로 자른다. */
function facilityLetter(grade: number): Grade {
  const clamped = Math.min(FACILITY_GRADE_MAX, Math.max(FACILITY_GRADE_MIN, Math.round(grade)));
  return FACILITY_LETTERS[clamped - FACILITY_GRADE_MIN] ?? 'E';
}

/** 성적 합산에 쓰는 공통 항목(PersonCareer 와 리딩 한 줄이 모두 만족한다) */
interface Counts {
  runners: number;
  wins: number;
  places: number;
  groupWins: number;
  earnings: Money;
}

const NO_COUNTS: Counts = { runners: 0, wins: 0, places: 0, groupWins: 0, earnings: 0 };

function pct(part: number, whole: number): number | null {
  return whole > 0 ? roundDisplay((part / whole) * PERCENT) : null;
}

function statLine(counts: Counts, g1Wins: number | null): StatLine {
  return {
    runners: counts.runners,
    wins: counts.wins,
    winRatePct: pct(counts.wins, counts.runners),
    placeRatePct: pct(counts.places, counts.runners),
    groupWins: counts.groupWins,
    g1Wins,
    earnings: counts.earnings,
  };
}

/**
 * 올해(리딩) · 통산(career) · 합계 성적. 올해 G1 승은 집계하지 않아 null 이다.
 * 합계의 G1 승은 통산분만 센다(올해 G1 은 아직 기록하지 않는다).
 */
function recordsOf(leadingEntry: Counts | undefined, career: PersonCareer): CareerRecords {
  const thisYear = leadingEntry ?? NO_COUNTS;
  const total: Counts = {
    runners: career.runners + thisYear.runners,
    wins: career.wins + thisYear.wins,
    places: career.places + thisYear.places,
    groupWins: career.groupWins + thisYear.groupWins,
    earnings: career.earnings + thisYear.earnings,
  };
  return {
    thisYear: statLine(thisYear, null),
    career: statLine(career, career.g1Wins),
    total: statLine(total, career.g1Wins),
  };
}

/** 기수 프로필. 없는 id 면 null. 원래 능력 수치는 등급으로만 바꿔 싣는다. */
export function jockeyProfile(state: GameState, jockeyId: string): JockeyProfile | null {
  const jockey = state.jockeys[jockeyId];
  if (jockey === undefined) return null;
  const { abilities } = jockey;
  const leadingEntry = state.seasonState.leading.jockey[jockeyId];
  return {
    personId: jockey.id,
    name: jockey.name,
    country: jockey.country,
    age: ageInYear(jockey.birthYear, state.date.year),
    apprentice: jockey.apprenticeAllowanceLb > 0,
    apprenticeAllowanceLb: jockey.apprenticeAllowanceLb,
    minRidingWeightLb: jockey.minRidingWeightLb,
    grades: [
      { labelKo: '출발', grade: gradeOf(abilities.start) },
      { labelKo: '페이스', grade: gradeOf(abilities.pace) },
      { labelKo: '마무리', grade: gradeOf(abilities.finish) },
      { labelKo: '힘', grade: gradeOf(abilities.strength) },
      { labelKo: '종합', grade: gradeOf(jockey.skill) },
    ],
    preferredStyleKo:
      jockey.preferredStyle === null ? PREFERRED_STYLE_NONE_KO : PREFERRED_STYLE_KO[jockey.preferredStyle],
    records: recordsOf(leadingEntry, jockey.career),
    relation: relationParts(state, 'jockey', jockeyId).view,
  };
}

/** 조교사 프로필. 없는 id 면 null. 원래 수치(조교·상마안·시설)는 등급으로만 싣는다. */
export function trainerProfile(state: GameState, trainerId: string): TrainerProfile | null {
  const trainer = state.trainers[trainerId];
  if (trainer === undefined) return null;
  const leadingEntry = state.seasonState.leading.trainer[trainerId];
  const ownedHorseCount = Object.values(state.horses).filter(
    (horse) => horse.ownerId === state.playerOwnerId && horse.trainerId === trainerId,
  ).length;
  const staminaKo =
    trainer.staminaBias >= TRAINER_BIAS_STYLE_THRESHOLD
      ? '장거리 쪽 조교'
      : trainer.staminaBias <= -TRAINER_BIAS_STYLE_THRESHOLD
        ? '단거리 쪽 조교'
        : '거리 편차 없는 조교';
  return {
    personId: trainer.id,
    name: trainer.name,
    country: trainer.country,
    age: ageInYear(trainer.birthYear, state.date.year),
    yardName: trainer.yardName,
    region: trainer.region,
    capacity: trainer.capacity,
    ownedHorseCount,
    grades: [
      { labelKo: '조교', grade: gradeOf(trainer.skill) },
      { labelKo: '상마안', grade: gradeOf(trainer.eye) },
      { labelKo: '시설', grade: facilityLetter(trainer.facilityGrade) },
    ],
    styleKo: TRAINER_STYLE_KO[trainer.style],
    staminaKo,
    juvenileKo:
      trainer.juvenileFocus >= TRAINER_JUVENILE_STYLE_MIN ? '2세 조기 출주에 적극적' : '2세 출주는 신중하게',
    records: recordsOf(leadingEntry, trainer.career),
    relation: relationParts(state, 'trainer', trainerId).view,
  };
}
