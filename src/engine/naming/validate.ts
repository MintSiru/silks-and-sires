import { BLOCKED_PLACE_MAX_WORDS, INITIAL_MAX_LETTERS, NAME_MAX_LENGTH, NAME_MAX_SYLLABLES } from '../config/naming';
import { countSyllables } from './syllables';
import type { NameRegistry, NameRejectReason, NameValidation } from './types';

/** 허용 문자: 영문자, 공백(단어 사이 한 칸), 아포스트로피 */
const ALLOWED_NAME = /^[A-Za-z' ]+$/;
const HAS_LETTER = /[A-Za-z]/;
const ENDS_WITH_DIGIT = /\d$/;

/**
 * 비교용 정규화: 소문자로 바꾸고 영문자 이외(공백·아포스트로피·마침표·하이픈)를 모두 뺀다.
 * 올바른 이름에는 영문자·공백·아포스트로피만 있으므로 명세의 "공백·아포스트로피 제거"와 같은 결과다.
 * 실명 종마 이름(Mr. Prospector)도 "Mr Prospector" 로 입력했을 때 걸리게 하려고 마침표·하이픈을 함께 뺀다.
 */
export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, '');
}

/** 단어 하나의 비교용 형태: 소문자, 끝 소유격 's 를 떼고 영문자만 남긴다 (Ascot's → ascot, Cote d'Azur → dazur). */
function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/'s$/, '').replace(/[^a-z]/g, '');
}

/** 차단 지명 토큰 정규화: 단어마다 normalizeWord, 단어 사이 한 칸. parseNamingData 가 쓴다. */
export function normalizePlaceToken(token: string): string {
  return token
    .split(/\s+/)
    .map(normalizeWord)
    .filter((w) => w !== '')
    .join(' ');
}

const NO_BLOCKED_TOKENS: ReadonlySet<string> = new Set<string>();

/**
 * 이름의 연속 1~BLOCKED_PLACE_MAX_WORDS 단어 묶음 중 차단 토큰과 같은 것이 있는지 본다.
 * 조각 단위 비교라서 "Ascot Lady", "Santa Anita Dream" 이 걸린다. 공백 없이 붙인 이름은 호출부가 붙이기 전에 검사한다.
 */
export function hasBlockedPlaceToken(name: string, blocked: ReadonlySet<string>): boolean {
  if (blocked.size === 0) {
    return false;
  }
  const words = name
    .split(/\s+/)
    .map(normalizeWord)
    .filter((w) => w !== '');
  for (let i = 0; i < words.length; i++) {
    for (let len = 1; len <= BLOCKED_PLACE_MAX_WORDS && i + len <= words.length; len++) {
      if (blocked.has(words.slice(i, i + len).join(' '))) {
        return true;
      }
    }
  }
  return false;
}

function reject(reason: NameRejectReason): NameValidation {
  return { ok: false, reason };
}

/**
 * 경주마 이름 등록 규칙 검사. 검사 순서: 길이 → 끝 숫자 → 문자 → 이니셜 → 음절 → 보호 명단 → 차단 지명 토큰 → 등록됨.
 * protectedNames 는 normalizeName 을 거친 집합이어야 한다.
 * blockedPlaceTokens 는 normalizePlaceToken 을 거친 집합이다. 생략하면 차단 지명 검사를 하지 않는다.
 */
export function validateHorseName(
  name: string,
  registry: NameRegistry,
  protectedNames: ReadonlySet<string>,
  blockedPlaceTokens: ReadonlySet<string> = NO_BLOCKED_TOKENS,
): NameValidation {
  if (name.length > NAME_MAX_LENGTH) {
    return reject('tooLong');
  }
  if (ENDS_WITH_DIGIT.test(name)) {
    return reject('endsWithNumber');
  }
  const words = name.split(' ');
  const structureOk = ALLOWED_NAME.test(name) && words.every((w) => w !== '' && HAS_LETTER.test(w));
  if (!structureOk) {
    return reject('invalidChars');
  }
  if (words.every((w) => w.replace(/[^A-Za-z]/g, '').length <= INITIAL_MAX_LETTERS)) {
    return reject('initialsOnly');
  }
  if (countSyllables(name) > NAME_MAX_SYLLABLES) {
    return reject('tooManySyllables');
  }
  const normalized = normalizeName(name);
  if (protectedNames.has(normalized)) {
    return reject('protected');
  }
  if (hasBlockedPlaceToken(name, blockedPlaceTokens)) {
    return reject('protected');
  }
  if (registry.isTaken(normalized)) {
    return reject('taken');
  }
  return { ok: true, normalized };
}
