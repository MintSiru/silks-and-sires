# M2-01b 2026 실명 종마 명단 확장 (사용자 제공 명단 기준)

담당: haiku-data · 선행: M2-01(커밋됨)

## 목적
사용자가 제공한 2026년 계류 명단으로 현역 종마 풀을 확장한다. 이 명단의 종마는 **2026 현역이 확인된 것**이므로 status "active", confidence "high".

## 가상화 규칙 (중요)
- 데이터에는 **종마 이름과 국가만** 넣는다. 명단의 출처인 목장·회사 이름은 어디에도 쓰지 않는다(데이터, _review.md, 테스트, 주석 모두).
- 교배료 금액은 저장하지 않는다. 아래 규칙으로 marketTier 만 정한다.
  - 100,000 이상 → 1 / 50,000~99,999 → 2 / 25,000~49,999 → 3 / 10,000~24,999 → 4 / 10,000 미만 → 5 / 비공개 → 4 (통화 구분 없이 같은 기준)

## 명단 (사용자 제공, 2026 기준. 이름 · 계류국 · 교배료)
**그룹 A (IE, EUR)**: Auguste Rodin 27,500 · Australia 15,000 · Blackbeard 17,500 · Camelot 60,000 · Churchill 15,000 · Camille Pissarro 30,000 · City of Troy 60,000 · Delacroix 40,000 · Footstepsinthesand 5,000 · Gleneagles 20,000 · Henri Matisse 20,000 · Henry Longfellow 12,500 · Holy Roman Emperor 5,000 · Little Big Bear 17,500 · No Nay Never 100,000 · Paddington 20,000 · Saxon Warrior 10,000 · Sioux Nation 37,500 · St Mark's Basilica 40,000 · Starspangledbanner 60,000 · The Antarctic 5,000
**그룹 B (US, USD)**: Citizen Bull 45,000 · Corniche 15,000 · Domestic Product 25,000 · Echo Town 5,000 · Epicenter 25,000 · Fierceness 50,000 · Golden Pal 25,000 · Gunite 25,000 · Jack Christopher 15,000 · Justify 200,000 · Mo Town 7,500 · Munnings 45,000 · Practical Joke 75,000 · Sierra Leone 75,000 · Tiz The Law 30,000
**그룹 C (GB, GBP)**: Cracksman 17,500 · Dubawi 350,000 · Farhh 비공개 · Harry Angel 10,000 · Iffraaj 10,000 · Masar 10,000 · Modern Games 30,000 · Palace Pier 45,000 · Perfect Power 10,000 · Pinatubo 35,000 · Territories 10,000 · Too Darn Hot 65,000 · Triple Time 10,000
**그룹 D (FR, EUR)**: Cloth of Stars 5,000 · Victor Ludorum 15,000
**그룹 E (IE, EUR)**: Blue Point 60,000 · Earthlight 15,000 · Ghaiyyath 25,000 · Native Trail 17,500 · Naval Crown 10,000 · Night of Thunder 100,000 · Raven's Pass 7,500 · Space Blues 16,000 · Teofilo 30,000
**그룹 F (US, USD)**: Cody's Wish 75,000 · Enticed 5,000 · Essential Quality 65,000 · Frosted 10,000 · Hard Spun 35,000 · Maxfield 35,000 · Medaglia d'Oro 75,000 · Midshipman 15,000 · Mystic Guide 12,500 · Nyquist 85,000 · Proxy 25,000 · Speaker's Corner 17,500 · Street Sense 60,000
**그룹 G (GB, GBP)**: Bated Breath 5,000 · Chaldean 20,000 · Frankel 350,000 · Kingman 125,000 · Lead Artist 12,500 · Oasis Dream 15,000
**그룹 H (US, USD)**: Elite Power 35,000 · Mandaloun 10,000
**그룹 I (사용자 추가 제공, 교배료 미기재 → Opus 지정 tier, 계류국은 위키백과로 확인하고 확인 안 되면 괄호 안 기본값)**: Sea The Stars tier 1 (IE) · Siyouni tier 1 (FR) · Zarak tier 3 (FR) · Vadeni tier 3 (IE) · Daryz tier 4 (FR) · Erevann tier 4 (FR)
(명단 표기 오타는 공식 표기로: "Teritorries" → Territories, "Cloths Of Stars" → Cloth of Stars, "Footstepinthesand" → Footstepsinthesand, "Medaglia D'Oro" → Medaglia d'Oro)

## 작업
1. 명단의 모든 종마를 active / standsIn(위 국가) / confidence "high" / marketTier(위 규칙)로 넣는다. 이미 있는 종마(Frankel, Dubawi 등)는 기존 레코드를 갱신한다(standsIn·tier·confidence).
2. 새 종마마다 위키백과 등으로 **부·모부·출생연도·출생국·거리/주로 성향**을 확인한다. 부계 사슬이 파일 안에서 끊김 없이 이어지도록 필요한 조상을 historical/pensioned 로 추가한다(예: Deep Impact → Sunday Silence → Halo → … 처럼). 사슬 규칙·계통 규칙은 M2-01 명세 그대로. 필요하면 계통(sire_lines)을 추가한다(예: Sunday Silence line, Galileo line 분리 여부는 계통 수 15~30 범위 안에서 판단).
3. 확인 안 되는 부계는 지어내지 말고, 그 종마의 sireKey 를 가장 가까운 확인된 조상까지 이어 붙이는 대신 **그 종마를 넣되 confidence 를 낮추지 말고** _review.md 에 "부계 미확인" 으로 기록한 뒤 Opus 에게 질문한다(이 경우만 sireKey null 루트 허용, 목록에 명시).
4. 명단에 없는 기존 active 종마(다른 출처 — Siyouni, Sea The Stars, Lope de Vega 등)는 그대로 active, confidence medium 유지.
5. 테스트 하한을 원래 목표로 되돌린다: `tests/data/stallions.test.ts` 의 유럽 active ≥ 50, 미국 active(dirt/both) ≥ 15. 그리고 "출처 목장 이름이 데이터에 없음" 검사를 추가하지 말 것(그 이름들을 테스트에 쓰게 되므로) — 대신 _review.md 에 출처 표기 없이 "사용자 제공 2026 명단(그룹 A~H)" 이라고만 적는다.

## 수정할 파일
1. `data/stallions/stallions.json` 2. `data/stallions/names.json` 3. `data/stallions/sire_lines.json` 4. `data/stallions/_review.md` 5. `tests/data/stallions.test.ts`

## 수용 기준
1. 명단 87두 전원 포함, active, 위 국가·tier 정확.
2. 유럽 active ≥ 50, 미국 active(dirt/both) ≥ 15 테스트 통과, 기존 구조 테스트 전부 통과.
3. 암말 이름 없음, 목장·회사 이름 없음(grep 으로 직접 확인하고 보고).
4. typecheck·lint 통과.

## 테스트 명령
`npx vitest run tests/data/stallions.test.ts && npm run typecheck && npm run lint`
