# M3-C7a 이름 생성 어휘 데이터 (M2-12 개정)

담당: haiku-data · 근거: docs/naming.md, 사용자 요청(위인·동사형·합성형·긴 이름 대폭 증대), CLAUDE.md 원칙 1 예외 2·3

## 목적
경주마 이름 생성기(C7b)가 쓸 어휘 사전, AI 마주 명명 스타일, 보호 명단, 역사 인물 이름 목록을 JSON 으로 만든다. 지금 쓰는 data/names/horse_words.json(형용사 150·명사 200, "형용사 명사" 한 가지 형태)을 대신한다.

## 생성할 파일
1. `data/naming/lexicon.en.json`
2. `data/naming/owner-styles.json`
3. `data/naming/protected.json`
4. `data/naming/historical.json` (신규)
5. `data/_names_review.md` 에 "M3-C7a" 절 추가(가상 지명, 접두어, 역사 인물 목록 표 — 이름·분야·사망 연도)
6. `tests/data/naming.test.ts` (아래 수용 기준을 검사)

## 스키마 (그대로)
```ts
// lexicon.en.json
interface NamingLexicon {
  version: 1;
  modifiers: string[];   // 형용사·수식어: Silver, Northern, Quiet
  nouns: string[];       // 명사: Harbour, Lantern, Crown
  verbs: string[];       // 동사 원형(phrase·동사형 이름용): Chase, Follow, Answer, Enable 류
  abstract: string[];    // 추상어·한 단어 이름: Resolve, Endeavour, Justify 류
  places: string[];      // 일반 지형어 + 가상 지명: Highland, Ashcombe
  foreign: { fr: string[]; it: string[]; de: string[] };
  culture: string[];     // 일반 음악·문학 용어: Sonata, Ballad, Encore
  phrases: string[];     // 합성·구절 틀. {N}=명사, {M}=수식어, {P}=장소, {V}=동사 자리: "{V} The {N}", "Born To {V}", "Sea Of {N}", "Over The {N}", "{N} In The {P}" … (자리 표시 외 단어는 영어 일반어)
  associations: Record<string, string[]>; // 키워드 → 연상어: "Sea": ["Tide","Harbour","Current"]
  syllables: { onsets: string[]; vowels: string[]; codas: string[] };
  stopwords: string[];   // The, Of, A, An, To, And, In
}
// owner-styles.json
interface OwnerNamingStyleFile {
  version: 1;
  styles: Array<{
    id: string; label: string;   // label 은 한국어 설명
    sourceWeights: Record<'pedigree'|'tribute'|'historical'|'place'|'culture'|'foreign'|'abstract'|'ownerStyle', number>;
    templateWeights: Record<'single'|'modifierNoun'|'possessive'|'phrase'|'verb'|'prefix', number>;
    prefix?: string;
  }>;
}
// protected.json
interface ProtectedNamesFile { version: 1; names: string[] }
// historical.json
interface HistoricalNamesFile {
  version: 1;
  people: Array<{ name: string; field: 'artist'|'writer'|'composer'|'explorer'|'scientist'; deathYear: number }>;
}
```

## 수용 기준
1. 5개 JSON 이 위 스키마와 정확히 일치(필드 추가 금지).
2. 최소 수량: modifiers 300, nouns 500, verbs 120, abstract 200, places 120(가상 지명 40 이상), foreign 언어별 100, culture 80, phrases 60, associations 키 150(키마다 연상어 3 이상), syllables 각 배열 12 이상. (기존 horse_words.json 의 단어는 포함해도 된다)
3. lexicon 의 단어는 영문자·아포스트로피만, 단어 하나 12자 이하(phrases 는 자리 표시 포함 한 줄 30자 이하), 배열 안 중복 없음(대소문자 무시).
4. owner-styles 12개 이상. 가중치 합 > 0, prefix 가진 스타일 3개 이상(접두어 8자 이하, 가상어), historical 가중치가 높은 "고전 예술 애호가"형 스타일 2개 이상, ownerStyle(음절 조합) 가중치가 높은 스타일 2개 이상.
5. protected.json: 1970~2020년대 유럽·일본·미국·호주의 유명 경주마 300개 이상(종마·암말·거세마, 중복 없음). 실명 종마 데이터(data/stallions/names.json)는 코드가 따로 차단하므로 여기 넣지 않아도 된다.
6. historical.json: 200명 이상. **모두 사망 연도 ≤ 1956**(2026년 기준 사망 후 70년 이상), 분야는 5개뿐, 분야마다 25명 이상. 정치인·군인·왕족·종교 인물·경마계 인물 금지. 이름은 경주마 이름 규칙에 맞게(영문자·공백·아포스트로피, 18자 이하, 악센트는 뺀 철자: Cezanne, Durer). data/stallions/names.json 의 종마 이름과 같은 사람(예: 그 이름의 종마가 있으면)은 넣지 않는다.
7. lexicon·owner-styles 에 실존 인물·경마장·레이스·후원사·목장·세일 회사·작품명·브랜드 금지, 실존 경주마 이름 금지(protected 에만). 비속어·차별 표현 금지.
8. `npm test && npm run typecheck && npm run lint` 통과.

## 금지
src/ 수정 금지. data/names/horse_words.json 은 지우지 않는다(C7b 가 교체 후 정리). git commit 금지.
