/**
 * 인맥 화면 뷰 모델 (M4-C10a). 조교사·기수의 관계·전속 계약·제의 가능 여부와 명성 표시. 순수 함수만 둔다.
 * 관계값은 소수 1자리로 보이고, 등급 문구는 text.ts 의 relationTierKo 를 쓴다.
 */
import { contractFor } from '../../engine/economy/contractQuery';
import { retainerQuote, type RetainerKind } from '../../engine/economy/contracts';
import { relationKey, relationOf } from '../../engine/economy/relations';
import { ageInYear } from '../../engine/time/calendar';
import type { CountryCode, GameState } from '../../engine/types';
import { feeKo, relationTierKo, retainerRefusalKo } from '../game/text';

/** 화면 표시 소수 자리(관계·명성). 밸런스 값이 아니라 표기 자리수다. */
const DISPLAY_DECIMALS = 1;
const DISPLAY_FACTOR = 10 ** DISPLAY_DECIMALS;

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

export type StaffQuote = { ok: true; feeKo: string } | { ok: false; reasonKo: string };

export interface StaffRow {
  personId: string;
  name: string;
  country: CountryCode;
  age: number;
  /** 관계값(소수 1자리) */
  relation: number;
  tierKo: string;
  /** 전속이면 '전속 (2027년 말까지, 연 €92,000)', 아니면 null */
  contractKo: string | null;
  /** 계약 제의 가능 여부와 계약금 또는 거절 사유 */
  quote: StaffQuote;
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

/**
 * 조교사(kind 'trainer') 또는 기수('jockey') 목록. 정렬: 전속 → 관계값 내림차순 → 이름 → id.
 * onlyKnown 이면 관계값이 기록된 사람과 전속인 사람만 남긴다.
 */
export function staffRows(state: GameState, kind: RetainerKind, filter: StaffFilter = {}): StaffRow[] {
  const entries = peopleOf(state, kind).flatMap((person) => {
    const key = relationKey(kind, person.id);
    const contract = contractFor(state, kind, person.id);
    const hasValue = state.relations.values[key] !== undefined;
    if (filter.onlyKnown === true && !hasValue && contract === undefined) return [];
    const raw = relationOf(state, key);
    const quote = retainerQuote(state, kind, person.id);
    const row: StaffRow = {
      personId: person.id,
      name: person.name,
      country: person.country,
      age: ageInYear(person.birthYear, state.date.year),
      relation: roundDisplay(raw),
      tierKo: relationTierKo(raw),
      contractKo:
        contract === undefined
          ? null
          : `전속 (${contract.endYear}년 말까지, 연 ${feeKo(contract.annualFee)})`,
      quote: quote.ok
        ? { ok: true, feeKo: feeKo(quote.fee) }
        : { ok: false, reasonKo: retainerRefusalKo(quote.reason) },
    };
    return [{ row, raw, contracted: contract !== undefined }];
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
