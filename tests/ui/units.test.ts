import { describe, expect, it } from 'vitest';
import {
  KG_ROUNDING_STEP,
  formatWeight,
  isWeightUnit,
  lbToKg,
  weightUnitLabelKo,
} from '../../src/ui/game/units';

describe('lbToKg', () => {
  it('126lb 는 57kg 이다', () => {
    expect(lbToKg(126)).toBe(57);
  });

  it('133lb 는 60.33kg 이므로 60.5kg 이다', () => {
    expect(lbToKg(133)).toBe(60.5);
  });

  it('112lb 는 51kg 이다', () => {
    expect(lbToKg(112)).toBe(51);
  });

  it('9lb 는 4.08kg 이므로 4kg 이다', () => {
    expect(lbToKg(9)).toBe(4);
  });

  it('결과는 항상 0.5kg 단위이다', () => {
    for (let lb = 100; lb <= 140; lb++) {
      const kg = lbToKg(lb);
      expect(Number.isInteger(kg / KG_ROUNDING_STEP)).toBe(true);
    }
  });
});

describe('formatWeight', () => {
  it('lb 단위는 "126lb" 형식이다', () => {
    expect(formatWeight(126, 'lb')).toBe('126lb');
  });

  it('kg 정수는 "57kg" 형식이다', () => {
    expect(formatWeight(126, 'kg')).toBe('57kg');
    expect(formatWeight(112, 'kg')).toBe('51kg');
    expect(formatWeight(9, 'kg')).toBe('4kg');
  });

  it('kg 소수 0.5 는 "60.5kg" 형식이다', () => {
    expect(formatWeight(133, 'kg')).toBe('60.5kg');
  });
});

describe('weightUnitLabelKo', () => {
  it('단위별 한국어 이름을 돌려준다', () => {
    expect(weightUnitLabelKo('lb')).toBe('파운드(lb)');
    expect(weightUnitLabelKo('kg')).toBe('킬로그램(kg)');
  });
});

describe('isWeightUnit', () => {
  it('lb 와 kg 만 유효하다', () => {
    expect(isWeightUnit('lb')).toBe(true);
    expect(isWeightUnit('kg')).toBe(true);
    expect(isWeightUnit('st')).toBe(false);
    expect(isWeightUnit(null)).toBe(false);
    expect(isWeightUnit(undefined)).toBe(false);
  });
});
