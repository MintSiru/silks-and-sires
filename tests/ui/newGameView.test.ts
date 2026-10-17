import { describe, expect, it } from 'vitest';
import { DEFAULT_ECONOMY_MODE, LEGACY_BANKRUPT_WEEKS } from '../../src/engine/config/economy';
import { DEFAULT_GAME_SETTINGS, STARTING_PACKAGES } from '../../src/engine/config/farm';
import { CATASTROPHIC_FRACTURE_SHARE } from '../../src/engine/config/injury';
import { feeKo } from '../../src/ui/game/text';
import {
  CATASTROPHIC_INJURY_HINT_KO,
  DIFFICULTY_OPTIONS,
  ECONOMY_MODE_OPTIONS,
  RECOMMENDED_START,
  START_TYPE_OPTIONS,
  isRecommendedStart,
  recommendedStartKo,
  ruleSummaryKo,
  startSummaryKo,
} from '../../src/ui/newGame/newGameView';

describe('startSummaryKo (M4-E0ui 새 게임 요약)', () => {
  it('보통 오너브리더(현역마 지급): 자금·암말 2·현역마 1(3세)·중형 목장 시설 1단계', () => {
    expect(startSummaryKo('owner_breeder', 'normal', true)).toEqual([
      '시작 자금 €600,000',
      '번식 암말 2두',
      '현역마 1두(3세)',
      '중형 목장 · 시설 1단계',
    ]);
  });

  it('어려움 오너브리더: 현역마 1두(사용자 결정 2026-10-17)·소형 목장', () => {
    expect(startSummaryKo('owner_breeder', 'hard', true)).toEqual([
      '시작 자금 €250,000',
      '번식 암말 1두',
      '현역마 1두(3세)',
      '소형 목장 · 시설 1단계',
    ]);
  });

  it('쉬움 마주: 현역마 3두(3세·2세·2세), 목장 없음 줄, 암말 줄 없음', () => {
    expect(startSummaryKo('owner', 'easy', true)).toEqual([
      '시작 자금 €1,500,000',
      '현역마 3두(3세·2세·2세)',
      '목장 없음 — 목장을 사면 오너브리더',
    ]);
  });

  it('현역마 지급을 끄면 오너브리더 현역마 줄이 "현역마 없음" 이다', () => {
    expect(startSummaryKo('owner_breeder', 'normal', false)).toContain('현역마 없음');
    expect(startSummaryKo('owner_breeder', 'normal', false)).not.toContain('현역마 1두(3세)');
  });

  it('마주 시작은 지급 여부와 무관하게 현역마를 준다(엔진과 같다)', () => {
    expect(startSummaryKo('owner', 'normal', false)).toEqual(startSummaryKo('owner', 'normal', true));
  });

  it('요약 수치는 config 의 STARTING_PACKAGES 와 같다', () => {
    for (const { value } of DIFFICULTY_OPTIONS) {
      const pkg = STARTING_PACKAGES[value];
      const ownerLines = startSummaryKo('owner', value, true);
      expect(ownerLines[0]).toBe(`시작 자금 ${feeKo(pkg.funds)}`);
      expect(ownerLines[1]).toMatch(new RegExp(`^현역마 ${pkg.ownerRacehorses}두`));
    }
  });
});

describe('선택지 상수', () => {
  it('시작 유형은 오너브리더·마주 두 가지이고 기본값은 엔진 기본 설정과 같다', () => {
    expect(START_TYPE_OPTIONS.map((o) => o.value)).toEqual(['owner_breeder', 'owner']);
    expect(START_TYPE_OPTIONS.map((o) => o.value)).toContain(DEFAULT_GAME_SETTINGS.startType);
  });

  it('난이도는 쉬움·보통·어려움이고 기본값(보통)을 포함한다', () => {
    expect(DIFFICULTY_OPTIONS.map((o) => o.value)).toEqual(['easy', 'normal', 'hard']);
    expect(DIFFICULTY_OPTIONS.map((o) => o.value)).toContain(DEFAULT_GAME_SETTINGS.difficulty);
  });

  it('예후불량 설명은 config 의 비율(약 40%)을 그대로 적는다', () => {
    expect(Math.round(CATASTROPHIC_FRACTURE_SHARE * 100)).toBe(40);
    expect(CATASTROPHIC_INJURY_HINT_KO).toContain('약 40%가 사망');
  });
});

describe('M6-U10 시작 화면 선택지 한 줄 설명(L2)', () => {
  it('모든 선택지는 결과 중심 한 줄 설명을 가진다', () => {
    for (const option of [...START_TYPE_OPTIONS, ...DIFFICULTY_OPTIONS, ...ECONOMY_MODE_OPTIONS]) {
      expect(option.line.length).toBeGreaterThan(4);
      expect(option.line).not.toContain('\n');
    }
  });

  it('캐주얼은 파산 없음과 빚으로 쌓인다는 결과를, 유료 지출이 막힌다는 조건을 말한다', () => {
    const casual = ECONOMY_MODE_OPTIONS.find((o) => o.value === 'casual');
    expect(casual?.line.startsWith('파산 없음 · 적자는 빚으로')).toBe(true);
    expect(casual?.line).toContain('유료 지출');
  });

  it('레거시 설명의 주 수는 config 의 파산 주 수와 같다', () => {
    const legacy = ECONOMY_MODE_OPTIONS.find((o) => o.value === 'legacy');
    expect(legacy?.line).toBe(`자금이 ${LEGACY_BANKRUPT_WEEKS}주 연속 음수면 파산합니다`);
    expect(LEGACY_BANKRUPT_WEEKS).toBe(12);
  });

  it('시작 유형 설명은 오너브리더 생산 · 마주 현역마 시작을 말한다', () => {
    expect(START_TYPE_OPTIONS.find((o) => o.value === 'owner')?.line).toContain('목장 없이 현역마');
    expect(START_TYPE_OPTIONS.find((o) => o.value === 'owner_breeder')?.line).toContain('번식 암말');
  });

  it('경제 모드 기본값(캐주얼)은 엔진 기본 경제 모드와 같다', () => {
    expect(ECONOMY_MODE_OPTIONS.map((o) => o.value)).toContain(DEFAULT_ECONOMY_MODE);
  });
});

describe('추천 조건(L1 추천 조건으로 시작)', () => {
  it('추천 조건은 엔진 기본 설정과 같고 소재국은 영국이다', () => {
    expect(RECOMMENDED_START.startType).toBe(DEFAULT_GAME_SETTINGS.startType);
    expect(RECOMMENDED_START.difficulty).toBe(DEFAULT_GAME_SETTINGS.difficulty);
    expect(RECOMMENDED_START.catastrophicInjuries).toBe(DEFAULT_GAME_SETTINGS.catastrophicInjuries);
    expect(RECOMMENDED_START.homeCountry).toBe('GB');
    expect(RECOMMENDED_START.economyMode).toBe(DEFAULT_ECONOMY_MODE);
  });

  it('추천 문구는 오너브리더 · 보통 · 영국 · 캐주얼(고급 설정)이다(경제 모드는 고급 설정 안에 있다)', () => {
    expect(recommendedStartKo()).toBe('오너브리더 · 보통 · 영국 · 캐주얼(고급 설정)');
  });

  it('추천 조건 그대로면 추천이고 하나라도 다르면 추천이 아니다', () => {
    expect(isRecommendedStart({ ...RECOMMENDED_START })).toBe(true);
    expect(isRecommendedStart({ ...RECOMMENDED_START, difficulty: 'hard' })).toBe(false);
    expect(isRecommendedStart({ ...RECOMMENDED_START, homeCountry: 'FR' })).toBe(false);
    expect(isRecommendedStart({ ...RECOMMENDED_START, economyMode: 'legacy' })).toBe(false);
    expect(isRecommendedStart({ ...RECOMMENDED_START, catastrophicInjuries: false })).toBe(false);
  });

  it('현역마 지급 선택은 오너브리더 추천 판정에 들어가고, 마주 시작에서는 지급 선택과 무관하다', () => {
    expect(isRecommendedStart({ ...RECOMMENDED_START, grantRacehorses: false })).toBe(false);
    const owner = { ...RECOMMENDED_START, startType: 'owner' as const };
    expect(isRecommendedStart({ ...owner, grantRacehorses: false })).toBe(
      isRecommendedStart({ ...owner, grantRacehorses: true }),
    );
  });
});

describe('고른 조건의 규칙 요약(M6-V V7 오른쪽 열)', () => {
  it('규칙 요약은 4줄이고 시작 유형·난이도·경제 모드·예후불량 순서다', () => {
    const lines = ruleSummaryKo({ ...RECOMMENDED_START });
    expect(lines).toHaveLength(4);
    expect(lines[0]).toMatch(/^오너브리더 — /);
    expect(lines[1]).toMatch(/^보통 — /);
    expect(lines[2]).toBe(`경제 캐주얼 — ${ECONOMY_MODE_OPTIONS[0]?.line ?? ''}`);
    expect(lines[3]).toMatch(/^예후불량 켬 — /);
  });

  it('경제 모드 줄은 고른 모드의 선택지 설명을 그대로 재사용한다', () => {
    const legacy = ruleSummaryKo({ ...RECOMMENDED_START, economyMode: 'legacy' });
    expect(legacy[2]).toBe('경제 레거시 — 자금이 12주 연속 음수면 파산합니다');
  });

  it('예후불량을 끄면 사망으로 이어지지 않는다는 줄이 되고, 비율은 엔진 config 에서 만든다', () => {
    const off = ruleSummaryKo({ ...RECOMMENDED_START, catastrophicInjuries: false });
    expect(off[3]).toBe('예후불량 끔 — 경주 중 중증 골절이 사망으로 이어지지 않습니다');
    const on = ruleSummaryKo({ ...RECOMMENDED_START, catastrophicInjuries: true });
    expect(on[3]).toContain(`${Math.round(CATASTROPHIC_FRACTURE_SHARE * 100)}%`);
  });
});
