# M2-12 5대 혈통 채우기 — 1묶음: 유럽 계류 시장 등급 1~2 현역 종마

담당: haiku-data · 선행: M2-10·M2-10b 커밋, M2-11(모마 칸 연결) 커밋 · 근거: 사용자 결정(2026-10-15) "1~2티어 종마부터 천천히"

## 대상 (19두 — Ulysses 는 M2-10b 에서 등급 4 로 내려가 제외)
Dubawi, Night of Thunder, Frankel, Camelot, Kingman, Sea The Stars, Golden Horn, Siyouni, Lope de Vega, Too Darn Hot, Blue Point, No Nay Never, Starspangledbanner, City of Troy, Zarak, Mehmas, (그 밖에 데이터에서 status active·marketTier ≤ 2·standsIn ∈ {GB, IE, FR, DE, IT} 인 것 전부 — 실행 시점에 목록을 뽑아 _review.md 에 적는다)

## 목표
대상 종마마다 **5대 혈통표의 수말 31칸**이 데이터로 닿게 한다. 레코드 구조:
- 각 레코드 = sireKey(부), damsireKey(1대 모부), femaleLineSireKeys = [2대 모부, 3대 모부, 4대 모부].
- 혈통표 위치는 '부' 걸음(S)과 'n대 모부' 걸음으로 이어진다. 대상 종마(0대)에서 g 대에 있는 수말 레코드는 남은 깊이(5 − g)만큼 자기 sireKey·damsireKey·femaleLineSireKeys 가 채워져 있어야 한다(예: 4대 수말은 부·1대 모부만, 3대 수말은 부·1대 모부·2대 모부까지).

## 방법
1. 출처: 위키백과(영어 우선, 없으면 독일어·프랑스어) 혈통표(Pedigree 틀) — 대개 4대까지 있다. 4대 칸 수말의 5대(그 수말의 부·모부)는 그 수말 문서의 인포박스·혈통표에서 가져온다.
2. 대상 종마부터 시작해 혈통표의 **수말** 이름만 읽어 레코드를 만든다·채운다. **암말 이름은 어디에도 저장하지 않는다**(원칙 1 — 혈통표에서 암말은 그 부를 찾는 경로로만 쓴다).
3. 데이터에 없는 수말은 새 레코드(status historical 또는 pensioned, standsIn null, foaled·countryOfBirth·sireLineId 필수, coatColour·distanceProfile 은 알면, 모르면 distanceProfile 은 부의 값, confidence 'low'). lastCoverYear 는 M2-03 규칙으로 알면.
4. 기존 레코드의 sireKey·damsireKey 가 위키백과와 다르면 **고치지 말고** _review.md 충돌 표에 올린다(Opus 판단).
5. 조회 간격 3초 이상, 429 는 30초 대기 후 재시도. 원문·스크립트는 저장소 밖(/tmp 아래 새 디렉터리).

## 산출
- data/stallions/stallions.json(추가·채움), data/stallions/names.json(새 이름), 필요하면 sire_lines.json.
- data/stallions/_review.md 'M2-12' 절: 대상별 채운 수말 칸 수(31 중 몇), 새 레코드 수, 충돌 표, 못 찾은 칸 목록.
- tests/data/stallions.test.ts 에 검사 추가: 대상 종마마다 데이터만으로 5대 수말 칸을 따라가는 함수(테스트 안에 작성)를 돌려 채운 칸 수 ≥ 25(못 채운 칸은 _review.md 에 있어야 함), 모든 키 참조 무결성.

## 수용 기준
1. 대상 평균 채움 ≥ 28/31, 최소 ≥ 25/31(미달 종마는 사유 기록).
2. 암말 이름 0건(새 레코드 key·names 에 암말 없음 — 검토 표에 '수말 여부 근거' 열).
3. `npm test && npm run typecheck && npm run lint` 통과. 깨지는 고정 해시(부트스트랩 결과·이름 생성 등)는 **고치지 말고** 목록만 보고(Opus 재고정).

## 금지
src/ 수정 금지. 기존 레코드의 부·모부 덮어쓰기 금지(충돌은 보고). git commit 금지.
