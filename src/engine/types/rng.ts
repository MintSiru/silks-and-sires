/**
 * 시드 기반 난수. 구현: src/engine/rng (sfc32).
 * 규칙: 숨은 캐시 상태 금지 — getState() 가 다음 출력을 완전히 결정해야 한다.
 */

export interface RngState {
  algo: 'sfc32';
  /** 32비트 부호 없는 정수 4개 */
  s: [number, number, number, number];
}

export interface Rng {
  /** [0, 1) 균등 분포 */
  next(): number;
  /** [min, max] 정수 균등 분포 (양끝 포함). min > max 이면 throw. */
  int(min: number, max: number): number;
  /** [min, max) 실수 균등 분포 */
  range(min: number, max: number): number;
  /** 정규 분포 (Box–Muller, 호출마다 균등 난수 2개 소비, 여분 캐시 없음). 기본 mean=0, sd=1 */
  normal(mean?: number, sd?: number): number;
  /** 확률 p 로 true */
  chance(p: number): boolean;
  /** 원소 하나 균등 선택. 빈 배열이면 throw. */
  pick<T>(items: readonly T[]): T;
  /** Fisher–Yates. 원본을 바꾸지 않고 새 배열 반환. */
  shuffle<T>(items: readonly T[]): T[];
  /**
   * 독립 하위 스트림 생성. 부모에서 next() 를 정확히 1회 소비하고,
   * 그 값과 label 해시를 섞어 자식 시드를 만든다.
   */
  fork(label: string): Rng;
  /** 현재 상태 복사본 */
  getState(): RngState;
}
