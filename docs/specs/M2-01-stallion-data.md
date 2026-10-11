# M2-01 실명 종마 데이터 + 부계 계통표

담당: haiku-data · 선행: 없음 (M1 과 병렬 진행)

## 목적
배합(M2)의 재료가 될 실명 종마 풀과 부계 계통 트리를 만든다. 실명 허용 대상은 **종마(씨수말) 이름과 국가명뿐**이다. 능력치·자손 성적은 게임이 가상으로 만들기 때문에, 여기에는 혈통 관계와 성향만 넣는다.

## 생성할 파일
1. `data/stallions/stallions.json` — `RealStallionRecord[]`
2. `data/stallions/names.json` — `StallionNameTable` (key → 이름)
3. `data/stallions/sire_lines.json` — `SireLine[]`
4. `data/stallions/_review.md` — 검수표
5. `tests/data/stallions.test.ts` — 검증 테스트

## 스키마 (수정 금지)
`src/engine/types/bloodline.ts` 의 `RealStallionRecord`, `SireLine`, `StallionNameTable`. 시작 연도는 2026.

## 내용 요구
### 현역 종마 (status "active", standsIn 필수)
- 유럽(GB·IE·FR·DE) 계류 **50두 이상**: 2026년 기준 현역으로 알려진 평지 종마. 상위권(marketTier 1~2) 약 15두, 중위권(3) 약 20두, 나머지 4~5.
- 미국(US) 계류 **15두 이상**: 더트 중심 종마(surfaceProfile "dirt" 또는 "both").
- 2026년에 현역인지 확신이 없으면 confidence "medium"/"low" 로 표시하고 근거를 _review.md 에 적는다. 사망·은퇴가 확실한 말은 active 로 두지 않는다(→ "pensioned" 또는 "historical").
### 조상 종마 (status "historical" 또는 "pensioned", standsIn null)
- 모든 active 종마의 **부계(sireKey 사슬)가 이 파일 안에서 끊김 없이** 계통 시조까지 이어져야 한다. 필요한 조상(예: 부·조부·증조부 …)을 historical 로 추가한다.
- damsireKey 는 알면 넣고(그 종마도 파일에 있어야 함), 모르면 null. 모부 때문에 조상을 무리하게 늘리지 않아도 된다(모부 대상 종마가 파일에 없으면 null 로 둔다).
- **암말 이름은 어디에도 쓰지 않는다**(모(母) 이름 금지, 실명 허용 대상 아님).
### 계통표 sire_lines.json
- 루트 계통(parentLineId null)은 시조 종마 기준 5~8개 정도(예: 노던댄서계, 미스터프로스펙터계, 네이티브댄서계 외 등 — label 은 영문 "<종마명> line").
- 하위 계통(예: "Sadler's Wells line", "Danzig line", "Storm Cat line", "Kingmambo line" 등)을 parentLineId 로 연결. 총 15~30개.
- founderKey 는 stallions.json 에 있어야 한다.
### 필드 규칙
- key: `stl_` + 소문자 snake_case (아포스트로피 제거). 예: `stl_sadlers_wells`.
- foaled: 정수 연도. 부보다 최소 3년 늦어야 한다.
- sireLineId 규칙: 자기 부와 같은 계통이거나, 자기 계통의 parentLineId 가 부의 계통이어야 한다(그 종마가 새 하위 계통의 시조인 경우).
- distanceProfile/surfaceProfile 은 그 종마 자손의 일반적 경향 기준.
- names.json 은 stallions.json 의 모든 key 를 정확히 한 번씩 포함하고, 그 외 key 는 없어야 한다. 이름은 공식 표기(국가 접미사 "(IRE)" 같은 건 제외).

## _review.md
표: `| key | 이름 | status | standsIn | confidence | 근거·의문점 |`. confidence 가 high 가 아닌 항목을 맨 위에 모은다.

## tests/data/stallions.test.ts 검사
1. key 중복 없음, 형식 `^stl_[a-z0-9_]+$`.
2. 모든 sireKey·damsireKey(null 제외)가 파일 안에 존재. sireKey 사슬에 순환 없음, 모든 사슬이 sireKey null 인 루트에서 끝남.
3. foaled: 부보다 3년 이상 늦음.
4. active ⇔ standsIn 이 null 이 아님. 유럽(GB/IE/FR/DE) active ≥ 50, US active ≥ 15.
5. sireLineId 가 sire_lines.json 에 존재, 위 계통 규칙 준수. sire_lines 의 parentLineId·founderKey 존재, 계통 트리에 순환 없음.
6. names.json 키 집합 = stallions.json 키 집합. 이름 중복 없음.
7. marketTier 1~5, confidence 값 범위, profile 값 범위.

## 금지 사항
- src/ 수정 금지(타입 포함). 다른 data 파일 수정 금지. 새 패키지 금지.
- 다른 티켓(M1 레이스 엔진)이 동시에 진행 중이다. 네 파일이 아닌 곳의 오류는 고치지 말고 보고하라.

## 테스트 명령
`npx vitest run tests/data/stallions.test.ts && npm run typecheck && npm run lint`
