import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { isWeightUnit } from './units';
import type { WeightUnit } from './units';

/** 단위 설정을 저장하는 localStorage 키. 게임 상태·저장 파일과는 무관하다. */
export const WEIGHT_UNIT_STORAGE_KEY = 'silks.weightUnit';
const DEFAULT_WEIGHT_UNIT: WeightUnit = 'lb';

export interface WeightUnitContextValue {
  unit: WeightUnit;
  setUnit: (unit: WeightUnit) => void;
}

/** 저장된 단위를 읽는다. 저장소가 막히거나 값이 잘못되면 기본값. */
function readStoredUnit(): WeightUnit {
  try {
    const stored = window.localStorage.getItem(WEIGHT_UNIT_STORAGE_KEY);
    return isWeightUnit(stored) ? stored : DEFAULT_WEIGHT_UNIT;
  } catch {
    return DEFAULT_WEIGHT_UNIT;
  }
}

/** 단위를 저장한다. 저장에 실패해도 화면 값은 그대로 유지된다. */
function writeStoredUnit(unit: WeightUnit): void {
  try {
    window.localStorage.setItem(WEIGHT_UNIT_STORAGE_KEY, unit);
  } catch {
    // 저장소를 쓸 수 없으면 이번 세션 동안만 적용된다.
  }
}

const WeightUnitContext = createContext<WeightUnitContextValue | null>(null);

export function WeightUnitProvider({ children }: { children: ReactNode }) {
  const [unit, setUnitState] = useState<WeightUnit>(readStoredUnit);

  const setUnit = useCallback((next: WeightUnit) => {
    setUnitState(next);
    writeStoredUnit(next);
  }, []);

  const value = useMemo(() => ({ unit, setUnit }), [unit, setUnit]);

  return <WeightUnitContext.Provider value={value}>{children}</WeightUnitContext.Provider>;
}

/** 부담중량 표시 단위와 변경 함수. WeightUnitProvider 안에서만 쓴다. */
export function useWeightUnit(): WeightUnitContextValue {
  const ctx = useContext(WeightUnitContext);
  if (ctx === null) {
    throw new Error('useWeightUnit 은 WeightUnitProvider 안에서 써야 합니다.');
  }
  return ctx;
}
