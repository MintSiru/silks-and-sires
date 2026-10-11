# M2-13 이름 검증기와 생성기

> 병합 메모(2026-10-11): main 에서 들어온 명세(원래 번호 M2-01/M2-02). 사용자 결정으로 M2 마무리 후 실행한다. 실행 전 Opus 가 현재 코드(src/engine/rng/, src/engine/horse/generate.ts 의 기존 이름 생성, data/names/horse_words.json)에 맞춰 개정한다.

- **담당:** haiku-coder
- **선행 조건:** M0 완료(시드 RNG `src/engine/rng.ts`), M2-12 승인
- **배경 문서:** docs/naming.md
- **Opus 메모:** M0에서 확정된 `Rng` 시그니처가 아래와 다르면, 위임 전에 Opus가 이 명세를 먼저 고친다.

## 목적
경주마 이름 검증기와, 혈통 연상·마주 스타일을 반영한 시드 기반 이름 후보 생성기를 구현한다.

## 생성할 파일 (5개)
1. `src/engine/naming/types.ts`
2. `src/engine/naming/syllables.ts`
3. `src/engine/naming/validate.ts`
4. `src/engine/naming/generate.ts`
5. `tests/naming.test.ts`

## 타입·인터페이스 (그대로 사용)

```ts
// 가정: src/engine/rng.ts (M0)
export interface Rng {
  next(): number;                         // [0, 1)
  int(min: number, max: number): number;  // 양끝 포함
  pick<T>(items: readonly T[]): T;
}

// src/engine/naming/types.ts
export type NameSource = "pedigree" | "tribute" | "place" | "culture" | "foreign" | "abstract" | "ownerStyle";
export type NameTemplate = "single" | "modifierNoun" | "possessive" | "phrase" | "prefix";

export interface NamingLexicon { /* M2-12 스키마와 동일. 필드를 그대로 옮겨 적는다 */ }

export interface OwnerNamingStyle {
  id: string;
  sourceWeights: Record<NameSource, number>;
  templateWeights: Record<NameTemplate, number>;
  prefix?: string;
}

export interface NamingContext {
  sireName: string;
  damName: string;
  style: OwnerNamingStyle;
  tributeNames: readonly string[];   // 게임 속 가상 인물의 성(surname). 엔진이 넘겨줌
}

export interface NameCandidate {
  name: string;
  template: NameTemplate;
  source: NameSource;
  note: string;   // 한국어 한 줄 이유. 예: "어미 Silver Tide의 'Tide'에서"
}

export type NameRejectReason =
  | "tooLong" | "tooManySyllables" | "invalidChars" | "initialsOnly"
  | "endsWithNumber" | "protected" | "taken";

export type NameValidation = { ok: true } | { ok: false; reasons: NameRejectReason[] };

export interface NameRegistry {
  isTaken(name: string, year: number): boolean;
}

// src/engine/naming/syllables.ts
export function countSyllables(name: string): number;                 // 모음(a,e,i,o,u,y) 연속 묶음 수, 단어 끝 묵음 e 제외, 단어당 최소 1
export function makeSyllableWord(lex: NamingLexicon, rng: Rng): string; // 2~3음절, 첫 글자 대문자

// src/engine/naming/validate.ts
export function normalizeName(name: string): string;  // 소문자화 + 공백·아포스트로피 제거
export function validateHorseName(
  name: string, year: number, registry: NameRegistry, protectedNames: ReadonlySet<string> // normalizeName 적용된 값
): NameValidation;

// src/engine/naming/generate.ts
export function extractKeywords(name: string, lex: NamingLexicon): string[]; // 단어 분리, stopwords 제외
export function suggestNames(
  ctx: NamingContext, lex: NamingLexicon, rng: Rng, count: number,
  year: number, registry: NameRegistry, protectedNames: ReadonlySet<string>
): NameCandidate[];
```

## 동작 규칙
- 템플릿은 `style.templateWeights`, 출처는 `style.sourceWeights` 가중치로 고른다. `prefix` 템플릿은 `style.prefix`가 없으면 가중치 0으로 취급한다.
- 템플릿 패턴: single=`{abstract|foreign|syllableWord}`, modifierNoun=`{modifier} {noun}`, possessive=`{noun}'s {noun}` 또는 `{noun} of {place}`, phrase=`{verb} The {noun}` 또는 `Born to {noun}`, prefix=`{prefix} {noun}`.
- pedigree 출처: 부모 키워드를 직접 쓰거나 `associations[키워드]`의 연상어로 바꿔 템플릿에 넣는다. note에 어느 부모의 어느 단어인지 적는다.
- tribute 출처: `ctx.tributeNames`의 성을 single 또는 possessive(`{surname}'s {noun}`)에 쓴다.
- 후보는 반드시 `validateHorseName`을 통과해야 하고, 서로 중복되지 않는다. 시도는 후보당 최대 50회, 실패하면 그만큼 적게 반환한다.

## 수용 기준
1. 같은 시드·같은 입력이면 `suggestNames`의 결과 배열이 완전히 같다.
2. `count=8`로 1,000번(시드 1~1000) 호출했을 때 모든 후보가 `validateHorseName`을 통과하고, 호출당 결과 길이 평균이 7.5 이상이다.
3. 부모 이름 중 하나에 `associations` 키가 있으면, `count=8` 호출 1,000번 중 95% 이상에서 pedigree 후보가 1개 이상 나온다(pedigree 가중치가 0보다 큰 스타일 기준).
4. `validateHorseName`이 다음을 각각 올바른 사유로 거절한다: 19자 이름, 8음절 이름, 숫자·하이픈·마침표 포함, "J P R", "Storm 2", 보호 명단 이름(대소문자·공백만 다른 경우 포함), 등록된 이름.
5. `prefix`가 있는 스타일에서 prefix 템플릿 후보는 접두어로 시작하고 18자 이내다.
6. naming 폴더 코드에 `Math.random`, `Date.now`, DOM API가 없다.

## 금지 사항
- `src/engine/rng.ts`와 다른 공용 타입 파일 수정 금지.
- 데이터 파일(`data/`) 수정 금지. 테스트용 어휘는 테스트 파일 안에 작은 픽스처로 만든다.
- 새 npm 패키지 설치 금지.
- 생성 규칙에 실존 인물·작품·브랜드 이름을 하드코딩하지 않는다.

## 테스트 명령
```
npm test -- naming && npm run typecheck && npm run lint
```
