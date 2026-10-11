# M2-12 이름 생성용 어휘 데이터

> 병합 메모(2026-10-11): main 에서 들어온 명세(원래 번호 M2-01/M2-02). 사용자 결정으로 M2 마무리 후 실행한다. 실행 전 Opus 가 현재 코드(src/engine/rng/, src/engine/horse/generate.ts 의 기존 이름 생성, data/names/horse_words.json)에 맞춰 개정한다.

- **담당:** haiku-data
- **선행 조건:** 없음 (M0와 병렬 진행 가능)
- **배경 문서:** docs/naming.md

## 목적
이름 생성기(M2-13)가 쓸 어휘 사전, AI 마주 명명 스타일, 보호 명단을 JSON으로 만든다.

## 생성할 파일
1. `data/naming/lexicon.en.json`
2. `data/naming/owner-styles.json`
3. `data/naming/protected.json`
4. `data/_names_review.md` (Opus 검수용 목록)

## 스키마 (그대로 지킬 것)

```ts
// data/naming/lexicon.en.json
interface NamingLexicon {
  version: 1;
  modifiers: string[];      // 형용사·수식어. 예: "Silver", "Northern", "Quiet"
  nouns: string[];          // 명사. 예: "Harbour", "Lantern", "Crown"
  verbs: string[];          // phrase 템플릿용 동사. 예: "Chase", "Follow", "Answer"
  abstract: string[];       // 추상어·동사형 한 단어. 예: "Resolve", "Endeavour"
  places: string[];         // 일반 지형어 + 가상 지명. 예: "Highland", "Ashcombe"
  foreign: { fr: string[]; it: string[]; de: string[] };
  culture: string[];        // 일반 음악·문학 용어. 예: "Sonata", "Ballad", "Encore"
  associations: Record<string, string[]>; // 키워드 → 연상어. 예: "Sea": ["Tide","Harbour","Current"]
  syllables: { onsets: string[]; vowels: string[]; codas: string[] }; // ownerStyle 음절 조합용
  stopwords: string[];      // "The","Of","A","An","To","And","In"
}

// data/naming/owner-styles.json
interface OwnerNamingStyleFile {
  version: 1;
  styles: Array<{
    id: string;                       // kebab-case
    label: string;                    // 한국어 설명. 예: "고전 예술 애호가"
    sourceWeights: Record<"pedigree"|"tribute"|"place"|"culture"|"foreign"|"abstract"|"ownerStyle", number>;
    templateWeights: Record<"single"|"modifierNoun"|"possessive"|"phrase"|"prefix", number>;
    prefix?: string;                  // 관명 접두어(있을 때만)
  }>;
}

// data/naming/protected.json
interface ProtectedNamesFile {
  version: 1;
  names: string[];   // 차단 전용. 실존 유명 경주마 이름
}
```

## 수용 기준
1. 모든 파일이 위 스키마와 정확히 일치하는 올바른 JSON이다(`node -e "JSON.parse(require('fs').readFileSync(p))"`로 3개 파일 모두 통과).
2. 최소 수량: modifiers 120, nouns 200, verbs 40, abstract 80, places 60(가상 지명 20 이상 포함), foreign 언어별 40, culture 40, associations 키 60개(키마다 연상어 3개 이상), syllables 각 배열 10 이상.
3. lexicon의 모든 단어는 영문자와 아포스트로피만 쓰고, 단어 하나당 12자 이하이며, 배열 안에 중복이 없다.
4. owner-styles.json에 스타일 8개. 각 가중치 합이 0보다 크고, `prefix`가 있는 스타일은 2개 이상이며 접두어는 8자 이하다.
5. protected.json에 1990~2020년대 유럽·일본·미국의 유명 경주마 이름 150개 이상(종마·암말·거세마 모두 포함, 중복 없음).
6. `data/_names_review.md`에 가상 지명 목록과 owner-styles 접두어 목록을 표로 정리했다.

## 금지 사항
- lexicon·owner-styles에 실존 인물, 실존 경마장·레이스·후원사·목장·세일 회사, 실존 작품명, 브랜드명 사용 금지.
- lexicon에 실존 경주마 이름을 넣지 않는다. 실존 경주마 이름은 protected.json에만 쓴다.
- 비속어·차별적 표현 금지.
- 스키마에 없는 필드 추가 금지.

## 테스트 명령
```
node -e "for (const p of ['data/naming/lexicon.en.json','data/naming/owner-styles.json','data/naming/protected.json']) JSON.parse(require('fs').readFileSync(p,'utf8')); console.log('ok')"
```
