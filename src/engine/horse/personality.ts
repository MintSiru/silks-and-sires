import type { Abilities, Personality, Rng, RunningStyle } from '../types';
import {
  CLUE_COMPOSURE_HIGH,
  CLUE_COMPOSURE_LOW,
  CLUE_HIGH,
  CLUE_LOW,
  CLUE_MAX_COUNT,
  PERSONALITY_HERITABILITY,
  PERSONALITY_INHERIT_SD,
  PERSONALITY_MAX,
  PERSONALITY_MEAN,
  PERSONALITY_MIN,
  PERSONALITY_SCALE,
  PERSONALITY_SD,
  STYLE_SCORE_FRONT_MIN,
  STYLE_SCORE_MIDFIELD_MIN,
  STYLE_SCORE_NOISE_SD,
  STYLE_SCORE_PROMINENT_MIN,
  STYLE_SCORE_W_COMPOSURE,
  STYLE_SCORE_W_DRIVE,
  STYLE_SCORE_W_SPEED,
  STYLE_SCORE_W_TIMIDITY,
} from '../config/personality';

/** 조교사·기수 코멘트 단서 키 (M3-C5a) */
export type PersonalityClueKey = 'gate_nervous' | 'keen_going' | 'genuine' | 'quirky' | 'laid_back';

function clampTrait(v: number): number {
  return Math.min(PERSONALITY_MAX, Math.max(PERSONALITY_MIN, v));
}

/** 축 하나의 신규 생성 값: N(MEAN, SD), 범위 자름 */
function sampleAxis(rng: Rng): number {
  return clampTrait(rng.normal(PERSONALITY_MEAN, PERSONALITY_SD));
}

/** 축 하나의 유전: MEAN + HERITABILITY × (부모 평균 − MEAN) + N(0, INHERIT_SD), 범위 자름 */
function inheritAxis(rng: Rng, sireValue: number, damValue: number): number {
  const mid = (sireValue + damValue) / 2;
  return clampTrait(
    PERSONALITY_MEAN +
      PERSONALITY_HERITABILITY * (mid - PERSONALITY_MEAN) +
      rng.normal(0, PERSONALITY_INHERIT_SD),
  );
}

/** 50 기준 −1~+1 편차 */
function deviation(value: number): number {
  return (value - PERSONALITY_MEAN) / PERSONALITY_SCALE;
}

/** 성격 5축을 무작위로 만든다. 축 순서: drive, composure, fight, timidity, stubbornness. 각 축 rng.normal 1회 */
export function generatePersonality(rng: Rng): Personality {
  return {
    drive: sampleAxis(rng),
    composure: sampleAxis(rng),
    fight: sampleAxis(rng),
    timidity: sampleAxis(rng),
    stubbornness: sampleAxis(rng),
  };
}

/** 부·모 성격으로 망아지 성격을 만든다. 축 순서는 generatePersonality 와 같다. 각 축 rng.normal 1회 */
export function inheritPersonality(rng: Rng, sire: Personality, dam: Personality): Personality {
  return {
    drive: inheritAxis(rng, sire.drive, dam.drive),
    composure: inheritAxis(rng, sire.composure, dam.composure),
    fight: inheritAxis(rng, sire.fight, dam.fight),
    timidity: inheritAxis(rng, sire.timidity, dam.timidity),
    stubbornness: inheritAxis(rng, sire.stubbornness, dam.stubbornness),
  };
}

/** 각질 점수의 결정 부분(잡음 제외). 앞으로 나가는 정도 */
function baseStyleScore(p: Personality, ability: Abilities): number {
  return (
    STYLE_SCORE_W_DRIVE * deviation(p.drive) -
    STYLE_SCORE_W_COMPOSURE * deviation(p.composure) -
    STYLE_SCORE_W_TIMIDITY * deviation(p.timidity) +
    (STYLE_SCORE_W_SPEED * (ability.speed - ability.stamina)) / PERSONALITY_SCALE
  );
}

/**
 * 성격 + 능력에서 선호 작전을 정한다. 각질 점수 f = 결정 부분 + N(0, NOISE_SD),
 * 문턱값으로 front / prominent / midfield / held_up. rng.normal 을 정확히 1회 쓴다.
 */
export function deriveStyle(p: Personality, ability: Abilities, rng: Rng): RunningStyle {
  const f = baseStyleScore(p, ability) + rng.normal(0, STYLE_SCORE_NOISE_SD);
  if (f >= STYLE_SCORE_FRONT_MIN) return 'front';
  if (f >= STYLE_SCORE_PROMINENT_MIN) return 'prominent';
  if (f >= STYLE_SCORE_MIDFIELD_MIN) return 'midfield';
  return 'held_up';
}

/**
 * 성격 단서 키. 조건을 만족한 단서 중 50 에서 가장 많이 벗어난 순(동률이면 아래 나열 순)으로 최대 CLUE_MAX_COUNT 개.
 * 벗어난 정도는 단서의 주축(gate_nervous: timidity, keen_going·laid_back: drive, genuine: fight, quirky: stubbornness)
 * 과 50 의 차이 절댓값이다. 해당 없으면 빈 배열.
 */
export function personalityClues(p: Personality): PersonalityClueKey[] {
  const candidates: { key: PersonalityClueKey; strength: number }[] = [];
  if (p.timidity >= CLUE_HIGH) {
    candidates.push({ key: 'gate_nervous', strength: Math.abs(p.timidity - PERSONALITY_MEAN) });
  }
  if (p.drive >= CLUE_HIGH && p.composure <= CLUE_COMPOSURE_LOW) {
    candidates.push({ key: 'keen_going', strength: Math.abs(p.drive - PERSONALITY_MEAN) });
  }
  if (p.fight >= CLUE_HIGH) {
    candidates.push({ key: 'genuine', strength: Math.abs(p.fight - PERSONALITY_MEAN) });
  }
  if (p.stubbornness >= CLUE_HIGH) {
    candidates.push({ key: 'quirky', strength: Math.abs(p.stubbornness - PERSONALITY_MEAN) });
  }
  if (p.drive <= CLUE_LOW && p.composure >= CLUE_COMPOSURE_HIGH) {
    candidates.push({ key: 'laid_back', strength: Math.abs(p.drive - PERSONALITY_MEAN) });
  }
  // Array.prototype.sort 은 안정 정렬이므로 동률은 나열 순을 유지한다
  candidates.sort((a, b) => b.strength - a.strength);
  return candidates.slice(0, CLUE_MAX_COUNT).map((c) => c.key);
}
