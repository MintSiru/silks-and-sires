/**
 * 관계값·명성 (M4-B1). 플레이어 기준 관계만 저장한다(AI 끼리의 관계는 저장하지 않는다).
 * - 관계값: −100 ~ 100, 없는 키 = 0. 저장은 소수 둘째 자리 반올림, 0 이 되면 키를 지운다.
 * - 명성: 0 ~ 100, 전체 하나. 결과 반영(season/apply·system)은 adjustReputation 으로 바꾼다.
 * - 주간 시스템(id 'relations'): 위탁 지속 → 시간 감소 → 명성 회귀 순.
 * 난수·시계 미사용. 모든 순회는 키 오름차순이라 같은 상태 → 같은 결과.
 */
import {
  RELATION_DECAY_WEEKLY,
  RELATION_MAX,
  RELATION_MIN,
  RELATION_ROUND_DECIMALS,
  RELATION_TIER_CLOSE,
  RELATION_TIER_COLD,
  RELATION_TIER_COOL,
  RELATION_TIER_NEUTRAL,
  RELATION_TIER_WARM,
  REPUTATION_BASE,
  REPUTATION_DECAY_WEEKLY,
  REPUTATION_MAX,
  REPUTATION_MIN,
  REPUTATION_RANK_LIST,
  REPUTATION_RANK_LIST_BONUS,
  REPUTATION_RANK_TOP,
  REPUTATION_RANK_TOP_BONUS,
  RETAINER_RELATION_FLOOR,
  RETAINER_RELATION_GAIN_MULT,
  TENURE_RELATION_CAP,
  TENURE_RELATION_WEEKLY,
} from '../config/economy';
import { isContractedKey } from './contractQuery';
import type {
  GameEvent,
  GameState,
  HorseStatus,
  LeadingEntry,
  RelationKey,
  RelationKind,
  TrainerId,
  WeeklySystem,
} from '../types';

/** 관계 등급 id (UI 문구는 src/ui/game/text.ts 가 맡는다) */
export type RelationTier = 'cold' | 'cool' | 'neutral' | 'warm' | 'close' | 'trusted';

/** 위탁 지속 대상 말 상태(현역) */
const TENURE_STATUSES: readonly HorseStatus[] = ['in_training', 'resting'];

const ROUND_FACTOR = 10 ** RELATION_ROUND_DECIMALS;

/** 소수 둘째 자리 반올림 */
function roundValue(v: number): number {
  return Math.round(v * ROUND_FACTOR) / ROUND_FACTOR;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** 관계 키 만들기: `${kind}:${id}` (예 'owner:ow-000012') */
export function relationKey(kind: RelationKind, id: string): RelationKey {
  return `${kind}:${id}` as RelationKey;
}

/** 관계값(없으면 0) */
export function relationOf(state: Pick<GameState, 'relations'>, key: RelationKey): number {
  return state.relations.values[key] ?? 0;
}

/** 관계값을 저장한다. 0 이면 키를 지운다(저장 크기) */
function setRelation(draft: GameState, key: RelationKey, value: number): void {
  if (value === 0) {
    delete draft.relations.values[key];
  } else {
    draft.relations.values[key] = value;
  }
}

/**
 * 관계값을 delta 만큼 바꾼다(−100 ~ 100 으로 자르고 소수 둘째 자리로 반올림). 새 값을 돌려준다.
 * 계약 중 키(M4-B3a): 양수 delta 는 RETAINER_RELATION_GAIN_MULT 배, 결과는 RETAINER_RELATION_FLOOR 아래로 내리지 않는다.
 */
export function adjustRelation(draft: GameState, key: RelationKey, delta: number): number {
  const contracted = isContractedKey(draft, key);
  const effective = contracted && delta > 0 ? delta * RETAINER_RELATION_GAIN_MULT : delta;
  let next = clamp(roundValue(relationOf(draft, key) + effective), RELATION_MIN, RELATION_MAX);
  if (contracted) next = Math.max(RETAINER_RELATION_FLOOR, next);
  setRelation(draft, key, next);
  return next;
}

/** 명성을 delta 만큼 바꾼다(0 ~ 100 으로 자르고 반올림). 새 값을 돌려준다 */
export function adjustReputation(draft: GameState, delta: number): number {
  const next = clamp(roundValue(draft.relations.reputation + delta), REPUTATION_MIN, REPUTATION_MAX);
  draft.relations.reputation = next;
  return next;
}

/** 관계값 → 등급 id. 경계값은 표의 말대로 (냉랭 ≤ −40, 서먹 < −10, 보통 ≤ 10, 우호 ≤ 40, 친밀 ≤ 70, 신뢰 > 70) */
export function relationTier(value: number): RelationTier {
  if (value <= RELATION_TIER_COLD) return 'cold';
  if (value < RELATION_TIER_COOL) return 'cool';
  if (value <= RELATION_TIER_NEUTRAL) return 'neutral';
  if (value <= RELATION_TIER_WARM) return 'warm';
  if (value <= RELATION_TIER_CLOSE) return 'close';
  return 'trusted';
}

/**
 * 위탁 지속(주간): 플레이어 현역마(in_training·resting)를 맡은 조교사마다 한 번씩 TENURE_RELATION_WEEKLY 를 더한다.
 * 위탁으로는 TENURE_RELATION_CAP 까지만 오른다(이미 그 이상이면 건드리지 않는다).
 */
export function applyTenure(draft: GameState): Set<RelationKey> {
  const trainerIds = new Set<TrainerId>();
  for (const id of Object.keys(draft.horses).sort()) {
    const horse = draft.horses[id];
    if (horse === undefined || horse.ownerId !== draft.playerOwnerId) continue;
    if (!TENURE_STATUSES.includes(horse.status) || horse.trainerId === null) continue;
    trainerIds.add(horse.trainerId);
  }
  const touched = new Set<RelationKey>();
  for (const trainerId of [...trainerIds].sort()) {
    const key = relationKey('trainer', trainerId);
    touched.add(key);
    const current = relationOf(draft, key);
    if (current >= TENURE_RELATION_CAP) continue;
    const next = Math.min(TENURE_RELATION_CAP, roundValue(current + TENURE_RELATION_WEEKLY));
    setRelation(draft, key, next);
  }
  return touched;
}

/** 시간 감소(주간): 모든 관계값을 0 쪽으로 RELATION_DECAY_WEEKLY 만큼 옮긴다. 0 을 넘지 않으며 0 이 되면 키를 지운다 */
export function decayRelations(draft: GameState, exempt: ReadonlySet<RelationKey> = new Set()): void {
  for (const key of Object.keys(draft.relations.values).sort() as RelationKey[]) {
    // 이번 주 위탁 중인 조교사는 감소하지 않는다(위탁 +0.1 이 감소에 묻히지 않게, M4-B1 Opus 결정)
    if (exempt.has(key)) continue;
    const value = draft.relations.values[key];
    if (value === undefined) continue;
    const next =
      value > 0
        ? Math.max(0, roundValue(value - RELATION_DECAY_WEEKLY))
        : Math.min(0, roundValue(value + RELATION_DECAY_WEEKLY));
    setRelation(draft, key, next);
  }
}

/** 계약 중 관계 키(정렬된 목록). 계약 목록의 (kind, personId) 에서 만든다 */
function contractedKeys(draft: GameState): RelationKey[] {
  const keys = draft.relations.contracts.map((c) => relationKey(c.kind, c.personId));
  return [...new Set(keys)].sort() as RelationKey[];
}

/**
 * 계약 중 키를 하한(RETAINER_RELATION_FLOOR)까지 올린다(주간 감소 단계, M4-B3a). 키가 없으면 만든다.
 * 체결 때 이미 하한 이상이므로 정상 상태에서는 아무것도 바뀌지 않는다.
 */
export function enforceRetainerFloor(draft: GameState): void {
  for (const key of contractedKeys(draft)) {
    if (relationOf(draft, key) < RETAINER_RELATION_FLOOR) setRelation(draft, key, RETAINER_RELATION_FLOOR);
  }
}

/** 명성 회귀(주간): REPUTATION_BASE 쪽으로 REPUTATION_DECAY_WEEKLY 만큼 옮긴다(넘지 않는다) */
export function regressReputation(draft: GameState): void {
  const rep = draft.relations.reputation;
  if (rep > REPUTATION_BASE) {
    draft.relations.reputation = Math.max(REPUTATION_BASE, roundValue(rep - REPUTATION_DECAY_WEEKLY));
  } else if (rep < REPUTATION_BASE) {
    draft.relations.reputation = Math.min(REPUTATION_BASE, roundValue(rep + REPUTATION_DECAY_WEEKLY));
  }
}

/**
 * 연말 리딩 마주 순위로 명성을 올린다(시상 계산 뒤에 부른다). owners 는 유럽 합산 리딩 상위(순위순).
 * 상위 REPUTATION_RANK_TOP 안이면 TOP 보너스, 그 밖에 상위 REPUTATION_RANK_LIST 안이면 LIST 보너스. 둘 다 아니면 0.
 */
export function reputationFromLeadingOwners(draft: GameState, owners: readonly LeadingEntry[]): void {
  const index = owners.findIndex((entry) => entry.id === draft.playerOwnerId);
  if (index < 0) return;
  const rank = index + 1;
  if (rank <= REPUTATION_RANK_TOP) {
    adjustReputation(draft, REPUTATION_RANK_TOP_BONUS);
  } else if (rank <= REPUTATION_RANK_LIST) {
    adjustReputation(draft, REPUTATION_RANK_LIST_BONUS);
  }
}

/**
 * 관계·명성 주간 시스템(id 'relations'). 순서: 위탁 → 감소(위탁 중 조교사·계약 중 키 면제) → 계약 하한 → 명성 회귀.
 * 이벤트는 내지 않는다
 */
export function createRelationsSystem(): WeeklySystem {
  return {
    id: 'relations',
    run(draft: GameState): GameEvent[] {
      const tenure = applyTenure(draft);
      const exempt = new Set<RelationKey>([...tenure, ...contractedKeys(draft)]);
      decayRelations(draft, exempt);
      enforceRetainerFloor(draft);
      regressReputation(draft);
      return [];
    },
  };
}
