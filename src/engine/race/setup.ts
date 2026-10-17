import type { HorseId, JockeyId, RaceEntry, Rng, RunningStyle, Silks } from '../types';

export interface EntryRequest {
  horseId: HorseId;
  jockeyId: JockeyId;
  tactic: RunningStyle;
  silks: Silks;
  isPlayer: boolean;
  /** 감량 전 부담중량(lb) */
  weightLb: number;
  /** 기수 견습 감량(lb) */
  jockeyAllowanceLb: number;
  /**
   * 개최 시드로 미리 확정한 게이트(M7-RD1b). 모든 요청에 있으면 buildEntries 는 추첨하지 않고 이 값을 쓴다
   * (다시보기는 저장된 field.requests 에서 같은 게이트를 얻는다). 일부만 있으면 RangeError.
   */
  draw?: number;
}

/**
 * 게이트 추첨. 1..fieldSize 를 rng.shuffle 한 결과를 반환한다.
 * rng 는 이 함수 안에서 shuffle 을 정확히 한 번 사용한다.
 */
export function drawStalls(rng: Rng, fieldSize: number): number[] {
  if (!Number.isInteger(fieldSize) || fieldSize < 1) {
    throw new RangeError(`drawStalls: fieldSize 는 1 이상의 정수여야 한다 (받은 값: ${fieldSize})`);
  }
  const numbers: number[] = [];
  for (let i = 1; i <= fieldSize; i++) {
    numbers.push(i);
  }
  return rng.shuffle(numbers);
}

/**
 * 출주 요청을 RaceEntry 로 변환한다.
 * - 반환 배열은 requests 와 같은 순서(index i = runner index i).
 * - 마번: 감량 전 부담중량 내림차순(최고 중량 = 1번), 동률은 요청 index 오름차순.
 * - 게이트: 요청에 draw 가 모두 있으면 그 값(1..n 순열이어야 한다, rng 미사용), 없으면 drawStalls(rng, n)[i]. 마번과 독립.
 * - weightLb: 요청 weightLb - jockeyAllowanceLb. odds: null.
 */
export function buildEntries(rng: Rng, requests: readonly EntryRequest[]): RaceEntry[] {
  if (requests.length === 0) {
    throw new Error('buildEntries: 출주 요청이 비어 있다');
  }
  const seen = new Set<HorseId>();
  for (const req of requests) {
    if (seen.has(req.horseId)) {
      throw new Error(`buildEntries: horseId 중복 (${req.horseId})`);
    }
    seen.add(req.horseId);
  }

  const n = requests.length;
  const drawn = requests.filter((req) => req.draw !== undefined).length;
  if (drawn !== 0 && drawn !== n) {
    throw new RangeError(`buildEntries: 게이트는 전부 있거나 전부 없어야 한다 (${drawn}/${n})`);
  }
  const stalls = drawn === n ? requests.map((req) => req.draw ?? 0) : drawStalls(rng, n);
  if (drawn === n && [...stalls].sort((a, b) => a - b).some((draw, i) => draw !== i + 1)) {
    throw new RangeError('buildEntries: 확정 게이트는 1..n 순열이어야 한다');
  }

  const ranked = requests
    .map((req, index) => ({ index, weight: req.weightLb }))
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  const saddleCloths: number[] = [];
  ranked.forEach((r, rank) => {
    saddleCloths[r.index] = rank + 1;
  });

  return requests.map((req, i) => ({
    horseId: req.horseId,
    saddleCloth: saddleCloths[i] ?? 0,
    draw: stalls[i] ?? 0,
    jockeyId: req.jockeyId,
    weightLb: req.weightLb - req.jockeyAllowanceLb,
    tactic: req.tactic,
    silks: { ...req.silks },
    isPlayer: req.isPlayer,
    odds: null,
  }));
}
