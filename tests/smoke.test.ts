import { describe, expect, it } from 'vitest';
import * as types from '../src/engine/types';

describe('smoke: engine types', () => {
  it('TURF_GOING_ORDER 는 7단계이다', () => {
    expect(types.TURF_GOING_ORDER.length).toBe(7);
  });

  it('AW_GOING_ORDER 는 3단계이다', () => {
    expect(types.AW_GOING_ORDER.length).toBe(3);
  });

  it('SAVE_FORMAT 은 silks-and-sires-save 이다', () => {
    expect(types.SAVE_FORMAT).toBe('silks-and-sires-save');
  });
});
