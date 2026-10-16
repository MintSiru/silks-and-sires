import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME_SETTINGS, STARTING_PACKAGES } from '../../src/engine/config/farm';
import { CATASTROPHIC_FRACTURE_SHARE } from '../../src/engine/config/injury';
import { feeKo } from '../../src/ui/game/text';
import {
  CATASTROPHIC_INJURY_HINT_KO,
  DIFFICULTY_OPTIONS,
  START_TYPE_OPTIONS,
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

  it('어려움 오너브리더: 현역마 줄이 "현역마 없음" 이고 소형 목장', () => {
    expect(startSummaryKo('owner_breeder', 'hard', true)).toEqual([
      '시작 자금 €250,000',
      '번식 암말 1두',
      '현역마 없음',
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
