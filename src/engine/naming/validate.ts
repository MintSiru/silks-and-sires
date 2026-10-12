import { INITIAL_MAX_LETTERS, NAME_MAX_LENGTH, NAME_MAX_SYLLABLES } from '../config/naming';
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

function reject(reason: NameRejectReason): NameValidation {
  return { ok: false, reason };
}

/**
 * 경주마 이름 등록 규칙 검사. 검사 순서: 길이 → 끝 숫자 → 문자 → 이니셜 → 음절 → 보호 명단 → 등록됨.
 * protectedNames 는 normalizeName 을 거친 집합이어야 한다.
 */
export function validateHorseName(
  name: string,
  registry: NameRegistry,
  protectedNames: ReadonlySet<string>,
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
  if (registry.isTaken(normalized)) {
    return reject('taken');
  }
  return { ok: true, normalized };
}
