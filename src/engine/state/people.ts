import {
  OWNER_ID_PREFIX,
  JOCKEY_ID_PREFIX,
  PEOPLE_COUNTRY_ORDER,
  PEOPLE_ID_DIGITS,
  PEOPLE_PER_COUNTRY,
  TRAINER_ID_PREFIX,
} from '../config/people';
import {
  createPeopleContext,
  generateJockey,
  generateOwner,
  generateTrainer,
  type PeopleStaticData,
} from '../people/generate';
import type { GameState, Rng } from '../types';

function formatId(prefix: string, n: number): string {
  return `${prefix}${String(n).padStart(PEOPLE_ID_DIGITS, '0')}`;
}

/**
 * 세계 인물 풀(기수·조교사·마주)을 PEOPLE_PER_COUNTRY 만큼 채운 새 상태를 돌려준다.
 * 원본 state 는 바꾸지 않는다(structuredClone). 같은 입력 + 같은 rng 상태 → 같은 결과.
 * AI 인물(기수·조교사·플레이어가 아닌 마주)이 이미 있으면 Error(이중 초기화 방지).
 * 월드 초기화(bootstrapWorld)와의 연결은 A6 에서 newGame 흐름이 한다.
 */
export function bootstrapPeople(state: GameState, data: PeopleStaticData, rng: Rng): GameState {
  const hasAiPeople =
    Object.keys(state.jockeys).length > 0 ||
    Object.keys(state.trainers).length > 0 ||
    Object.values(state.owners).some((o) => !o.isPlayer);
  if (hasAiPeople) {
    throw new Error('bootstrapPeople: 이미 AI 인물이 있다(이중 초기화)');
  }

  const next = structuredClone(state);
  const ctx = createPeopleContext(data, next.date.year);

  let jockeyNo = 0;
  let trainerNo = 0;
  let ownerNo = 0;

  for (const country of PEOPLE_COUNTRY_ORDER) {
    const count = PEOPLE_PER_COUNTRY[country];

    for (let i = 0; i < count.jockeys; i++) {
      jockeyNo += 1;
      const jockey = generateJockey(rng, ctx, formatId(JOCKEY_ID_PREFIX, jockeyNo), country);
      next.jockeys[jockey.id] = jockey;
    }

    for (let i = 0; i < count.trainers; i++) {
      trainerNo += 1;
      const trainer = generateTrainer(rng, ctx, formatId(TRAINER_ID_PREFIX, trainerNo), country);
      next.trainers[trainer.id] = trainer;
    }

    for (let i = 0; i < count.owners; i++) {
      ownerNo += 1;
      const owner = generateOwner(rng, ctx, formatId(OWNER_ID_PREFIX, ownerNo), country);
      if (next.owners[owner.id] !== undefined) {
        throw new Error(`bootstrapPeople: 마주 ID 충돌 ${owner.id}`);
      }
      next.owners[owner.id] = owner;
    }
  }

  return next;
}
