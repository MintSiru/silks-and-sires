// 용어 도움말 사전과 OR 판정 문구(순수 함수, DOM 없음).
// 풀이는 일반 경마 용어의 뜻만 적는다. 실제 경마장·레이스·사람 이름은 쓰지 않는다.

export const GLOSSARY_IDS = [
  'or',
  'nick',
  'inbreeding',
  'black_type',
  'group',
  'listed',
  'handicap',
  'furlong',
  'going',
  'draw',
  'stud_fee',
] as const;

export type GlossaryId = (typeof GLOSSARY_IDS)[number];

export interface GlossaryEntry {
  /** 화면에 보이는 용어 표기. */
  term: string;
  /** 한 줄 풀이. title·말풍선·스크린리더 설명에 쓴다. */
  gloss: string;
}

export const GLOSSARY: Record<GlossaryId, GlossaryEntry> = {
  or: {
    term: 'OR',
    gloss: '공식 레이팅. 경주 성적으로 매긴 말의 능력 점수이며, 높을수록 강한 말이다.',
  },
  nick: {
    term: '니크',
    gloss: '혈통의 궁합. 특정 씨수말과 암말 계통의 조합이 좋은 자손을 자주 낸다고 보는 것이다.',
  },
  inbreeding: {
    term: '근친(인브리드)',
    gloss: '혈통표에 같은 조상이 두 번 이상 나타나는 정도다. 장점이 강조되지만 약점도 함께 나올 수 있다.',
  },
  black_type: {
    term: '블랙타입',
    gloss: '그룹·리스티드 등 높은 등급 경주에서 거둔 성적에 붙는 표시. 번식 가치를 가늠하는 기준이다.',
  },
  group: {
    term: '그룹(G1~G3)',
    gloss: '유럽 평지 경주의 최상위 등급. G1 이 가장 높으며 상금과 번식 가치가 가장 크다.',
  },
  listed: {
    term: '리스티드',
    gloss: '그룹 바로 아래의 높은 등급 경주다. 그룹 경주 다음 수준의 상금 경주다.',
  },
  handicap: {
    term: '핸디캡',
    gloss: '공식 레이팅에 따라 말마다 부담 중량을 달리해 실력 차를 맞추는 경주 방식이다.',
  },
  furlong: {
    term: '펄롱',
    gloss: '거리 단위. 1펄롱은 약 201미터, 8분의 1마일이다.',
  },
  going: {
    term: '마장(Firm~Heavy)',
    gloss: '경주로의 상태. 단단한 쪽(Firm)부터 질퍽한 쪽(Heavy)까지 7단계로 나뉘며, 말마다 잘 맞는 상태가 다르다.',
  },
  draw: {
    term: '게이트(draw)',
    gloss: '출발 칸을 정하는 추첨 번호다. 같은 경주에서도 번호에 따라 유불리가 생길 수 있다.',
  },
  stud_fee: {
    term: '종부료',
    gloss: '씨수말이 암말과 교배할 때 암말 쪽이 내는 요금이다.',
  },
};

/**
 * OR 판정 경계(화면 표시용 띠). 값 이상이면 해당 띠다.
 * 근거: 유럽 공식 레이팅 관례에 맞춘 표시 기준이며 Opus 가 정했다(docs/specs/M6-T-tutorial.md T1 2항).
 * 엔진의 레이팅 계산·출주 판정에는 쓰지 않는다. 화면 문구 전용이다.
 */
export const OR_BAND_THRESHOLDS = {
  g1: 110,
  group: 100,
  top: 85,
  mid: 70,
} as const;

/** OR 값의 띠 이름. 110 이상 'G1급', 100 이상 '그룹급', 85 이상 '상위권', 70 이상 '중위권', 그 아래 '하위권'. */
export function orBandKo(or: number): string {
  if (or >= OR_BAND_THRESHOLDS.g1) return 'G1급';
  if (or >= OR_BAND_THRESHOLDS.group) return '그룹급';
  if (or >= OR_BAND_THRESHOLDS.top) return '상위권';
  if (or >= OR_BAND_THRESHOLDS.mid) return '중위권';
  return '하위권';
}

/** OR 값 표기. 예: 95 → '95 (상위권)', 없음(null) → '미부여'. 앞에 'OR ' 을 붙이는 것은 화면 몫이다. */
export function orValueKo(or: number | null): string {
  if (or === null) return '미부여';
  return `${or} (${orBandKo(or)})`;
}
