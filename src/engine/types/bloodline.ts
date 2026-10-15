import type { CountryCode, SireLineId } from './common';
import type { CoatColour } from './horse';

/**
 * 실명 종마 정적 데이터 스키마 (data/stallions/*.json).
 * 이름은 data/stallions/names.json 의 key → 이름 표에만 둔다(표만 바꾸면 가상화 가능).
 * 능력치·자손 성적은 게임이 가상으로 생성하므로 여기에는 혈통 관계와 성향만 둔다.
 */

/** 거리 프로필 4단계(docs/stamina-and-nh.md): speed ≤ 9f, classic ~10f, middle ~12f, cup 14f+ */
export type DistanceProfile = 'speed' | 'classic' | 'middle' | 'cup';
export type SurfaceProfile = 'turf' | 'dirt' | 'both';
export type RealStallionStatus = 'active' | 'pensioned' | 'historical';
/** 종마 역할: 평지(기본) / 평지·NH 겸용 / NH(장애 생산). docs/stamina-and-nh.md 4-2 */
export type StudRole = 'flat' | 'dual' | 'nh';

/** 부계 계통. parentLineId 로 상위 계통에 연결(루트는 null) */
export interface SireLine {
  id: SireLineId;
  /** 표시명 (예: "Sadler's Wells line") — 종마 이름만 사용 */
  label: string;
  parentLineId: SireLineId | null;
  /** 계통 시조 종마 key */
  founderKey: string;
}

export interface RealStallionRecord {
  /** 'stl_' + snake_case. 이름과 분리된 고유 키 */
  key: string;
  foaled: number;
  countryOfBirth: CountryCode;
  /** 부(父). 계통 시조급 루트만 null */
  sireKey: string | null;
  /** 모부(母父, damsire). 모르면 null. 암말 이름은 저장하지 않는다 */
  damsireKey: string | null;
  /**
   * 모계 쪽 윗대 수말(5대 혈통표 채우기, 2026-10-15 사용자 결정). 암말 이름은 저장하지 않고 그 암말들의 부만 적는다.
   * [0] = 2대 모부(어미의 어미의 부), [1] = 3대 모부, [2] = 4대 모부. 모르면 null 또는 배열을 짧게. 생략 가능.
   */
  femaleLineSireKeys?: (string | null)[];
  sireLineId: SireLineId;
  status: RealStallionStatus;
  /** 2026 시즌 계류 국가. active 일 때만 값, 그 외 null */
  standsIn: CountryCode | null;
  distanceProfile: DistanceProfile;
  surfaceProfile: SurfaceProfile;
  /** 시장 인기 등급 1(최상)~5. 실제 종부료 대신 게임용 등급 */
  marketTier: 1 | 2 | 3 | 4 | 5;
  /** 종마 역할. 생략 시 'flat' (NH 시장은 M4) */
  studRole?: StudRole;
  /** 털색(위키백과 인포박스 기준). 미확인이면 생략 — 엔진이 기본값(bay)으로 본다. M3-C6 */
  coatColour?: CoatColour;
  /** 데이터 확신도 (계류 상태·혈통 관계 기준) */
  confidence: 'high' | 'medium' | 'low';
  /**
   * 해외 단기 임대 등으로 이 연도부터 standsIn 에서 교배 가능(그 전 시즌은 교배 불가).
   * 예: American Pharoah 2025~2026 일본 임대 → 2027. 생략하면 제한 없음.
   */
  availableFromYear?: number;
  /**
   * 마지막 교배 시즌 연도(사망·종마 은퇴). 이 해 뒤에 태어날 자마(교배 연도 > 이 값)는 만들 수 없다.
   * active 는 생략. historical·pensioned 는 위키백과 사망·은퇴 연도, 모르면 생략(엔진이 MAX_STUD_AGE 로 추정).
   */
  lastCoverYear?: number;
}

/** key → 표시 이름 */
export type StallionNameTable = Record<string, string>;
