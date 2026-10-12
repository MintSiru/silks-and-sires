import type { Rng } from '../types';
import {
  MIN_SYLLABLES_PER_WORD,
  SILENT_E_MIN_WORD_LENGTH,
  SYLLABLE_CODA_CHANCE,
  SYLLABLE_UNIT_MAX,
  SYLLABLE_UNIT_MIN,
  SYLLABLE_WORD_ATTEMPTS,
  SYLLABLE_WORD_MAX,
  SYLLABLE_WORD_MIN,
  NAME_MAX_LENGTH,
} from '../config/naming';
import type { NamingLexicon } from './types';

const VOWELS = 'aeiouy';
const VOWEL_GROUP = /[aeiouy]+/g;

/**
 * 한 단어(공백 없음)의 음절 수. 모음(a e i o u y) 연속 묶음을 센다.
 * 단어 끝 묵음 e 는 제외하고, 단어당 최소 1 이다. 영문자가 아닌 글자는 무시한다.
 */
function syllablesInWord(word: string): number {
  if (word.length === 0) {
    return 0;
  }
  let letters = word.toLowerCase().replace(/[^a-z]/g, '');
  const beforeLast = letters[letters.length - 2];
  if (letters.length >= SILENT_E_MIN_WORD_LENGTH && letters.endsWith('e') && beforeLast !== undefined && !VOWELS.includes(beforeLast)) {
    letters = letters.slice(0, -1);
  }
  const groups = letters.match(VOWEL_GROUP);
  return Math.max(MIN_SYLLABLES_PER_WORD, groups === null ? 0 : groups.length);
}

/**
 * 이름의 음절 수. 공백으로 나눈 단어마다 셈하고 합한다.
 * 아포스트로피는 단어 안에 붙어 있는 것으로 보고 무시한다(Sadler's → 한 단어).
 * 붙여 쓴 이름(Savethelastdance)은 한 단어로 센다.
 */
export function countSyllables(name: string): number {
  let total = 0;
  for (const raw of name.split(/\s+/)) {
    total += syllablesInWord(raw);
  }
  return total;
}

function capitalize(word: string): string {
  if (word.length === 0) {
    return word;
  }
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * 음절 조합 단어 하나. 음절 단위(onset+vowel[+coda])를 1~2개 이어 붙이고,
 * 음절 수가 SYLLABLE_WORD_MIN~MAX 이고 최대 글자 수 안인 것을 고른다.
 * 첫 글자만 대문자. 시도 횟수를 넘으면 마지막 후보를 돌려주며, 검증은 호출자가 한다.
 */
export function makeSyllableWord(lex: NamingLexicon, rng: Rng): string {
  const { onsets, vowels, codas } = lex.syllables;
  let last = '';
  for (let attempt = 0; attempt < SYLLABLE_WORD_ATTEMPTS; attempt++) {
    const units = rng.int(SYLLABLE_UNIT_MIN, SYLLABLE_UNIT_MAX);
    let raw = '';
    for (let u = 0; u < units; u++) {
      raw += rng.pick(onsets) + rng.pick(vowels);
      if (rng.chance(SYLLABLE_CODA_CHANCE)) {
        raw += rng.pick(codas);
      }
    }
    last = capitalize(raw);
    const count = countSyllables(last);
    if (count >= SYLLABLE_WORD_MIN && count <= SYLLABLE_WORD_MAX && last.length <= NAME_MAX_LENGTH) {
      return last;
    }
  }
  return last;
}
