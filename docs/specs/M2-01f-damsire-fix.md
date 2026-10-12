# M2-01f 외조부 확정값 반영 (조상 29두 추가 + 외조부 연결 39건)

담당: haiku-data · 선행: M2-01e 승인(15323db), CountryCode NZ 추가(f52696b)

## 목적
위키백과(영·일·프)로 확인한 값과 사용자가 직접 확인해 보낸 값으로 외조부를 확정한다. 파일에 없는 외조부는 조상 레코드로 추가한다.

## 생성·수정할 파일
1. `data/stallions/stallions.json` — 아래 표 1의 조상 29두 추가, 표 2의 damsireKey 39건 설정
2. `data/stallions/names.json` — 새 key 29개의 이름
3. `data/stallions/_review.md` — "M2-01f" 절 추가: 표 2 전체(종마, 외조부, 출처 wiki/user), 표 1 중 신뢰도 low 목록
4. `tests/data/stallions.test.ts` — 기존 테스트로 충분하면 수정하지 않는다

## 표 1. 새 조상 레코드 (29두)
공통값: `standsIn: null`, `damsireKey: null`, `marketTier: 5`. key 는 기존 규칙(`stl_` + 소문자·밑줄, 예: `stl_mark_of_esteem`, `stl_so_you_think`). sireKey 의 '-' 는 파일에 부마가 없어 null.

| 이름 | 출생 | 국가 | sireKey | sireLineId | status | distanceProfile | surface | confidence |
|---|---|---|---|---|---|---|---|---|
| Archipenko | 2004 | US | stl_kingmambo | sl_mr_prospector | historical | classic | turf | medium |
| Avenue of Flags | 1990 | US | stl_seattle_slew | sl_seattle_slew | historical | speed | dirt | low |
| Bailjumper | 1974 | US | - | sl_phalaris | historical | speed | dirt | low |
| Bernstein | 1997 | US | stl_storm_cat | sl_storm_cat | historical | speed | both | medium |
| Born To Sea | 2009 | IE | stl_invincible_spirit | sl_invincible_spirit | pensioned | classic | turf | medium |
| Cowboy Cal | 2005 | US | stl_giant_causeway | sl_storm_cat | historical | speed | turf | medium |
| Deploy | 1987 | GB | stl_shirley_heights | sl_phalaris | historical | middle | turf | medium |
| Dynaformer | 1985 | US | stl_roberto | sl_phalaris | historical | middle | both | high |
| Frozen Power | 2007 | GB | stl_oasis_dream | sl_danzig | pensioned | speed | turf | medium |
| Hallowed Crown | 2012 | AU | stl_street_cry | sl_mr_prospector | pensioned | speed | turf | medium |
| Holy Bull | 1991 | US | - | sl_phalaris | historical | speed | dirt | high |
| Include | 1997 | US | - | sl_phalaris | historical | classic | dirt | high |
| Kaldounevees | 1991 | FR | - | sl_caro | historical | classic | turf | low |
| Kendargent | 2003 | FR | - | sl_phalaris | historical | speed | turf | low |
| Kris | 1976 | GB | - | sl_native_dancer | historical | speed | turf | high |
| Lawman | 2004 | FR | stl_invincible_spirit | sl_invincible_spirit | pensioned | classic | turf | high |
| Lord At War | 1980 | AR | - | sl_phalaris | historical | classic | both | low |
| Made Of Gold | 1988 | US | - | sl_mr_prospector | historical | speed | dirt | low |
| Mark of Esteem | 1993 | IE | stl_darshaan | sl_phalaris | historical | speed | turf | high |
| Menifee | 1996 | US | stl_harlan | sl_storm_cat | historical | classic | dirt | high |
| Mineshaft | 1999 | US | stl_ap_indy | sl_ap_indy | historical | classic | dirt | high |
| Najran | 1999 | US | - | sl_phalaris | historical | speed | dirt | low |
| Selkirk | 1988 | US | - | sl_native_dancer | historical | speed | turf | high |
| Silver Hawk | 1979 | US | stl_roberto | sl_phalaris | historical | middle | turf | medium |
| Singspiel | 1992 | IE | - | sl_sadlers_wells | historical | middle | turf | high |
| So You Think | 2006 | NZ | - | sl_sadlers_wells | pensioned | classic | turf | high |
| Tricky Creek | 1986 | US | - | sl_phalaris | historical | speed | dirt | low |
| Vettori | 1992 | IE | stl_machiavellian | sl_mr_prospector | historical | speed | turf | medium |
| Zamindar | 1994 | US | stl_gone_west | sl_mr_prospector | historical | speed | turf | medium |

## 표 2. damsireKey 설정 (39건) — 왼쪽 종마의 damsireKey = 오른쪽 외조부 key
- 위키백과 확인(wiki): Dubawi→Deploy, Nathaniel→Silver Hawk, Medaglia d'Oro→Bailjumper, Into Mischief→Tricky Creek, Lope de Vega→Vettori, Too Darn Hot→Singspiel, Ghaiyyath→Galileo, Daryz→Selkirk, Raven's Pass→Lord At War, Starspangledbanner→Made Of Gold, Sealiway→Kendargent, Perfect Power→Frozen Power, Victor Ludorum→Kaldounevees, Gunite→Cowboy Cal, Corniche→Najran, Blackbeard→Born To Sea, Midshipman→Avenue of Flags, Delacroix→Bernstein
- 사용자 확인(user): Kingman→Zamindar, Zarak→Zamindar, Camille Pissarro→Pivotal, The Antarctic→Lawman, Echo Town→Menifee, Triple Time→Mark of Esteem, Enticed→Mineshaft, Proxy→Include, Bated Breath→Distant View, Puchkine→So You Think, Stunning Spirit→Dynaformer, Bradsell→Archipenko, Aesterius→Hallowed Crown, Kodiac→Kris, Footstepsinthesand→Rainbow Quest, Tiz The Law→Tiznow, Ardad→Red Clubs, Sioux Nation→Oasis Dream, Domestic Product→Paynter, Mo Town→Bernardini, Munnings→Holy Bull
- 이 중 Perfect Power·Victor Ludorum·Gunite·Corniche·Blackbeard·Midshipman·Delacroix·Munnings 는 기존 값을 **바꾸는** 것이다(기존 값이 틀렸음).
- 이름 대조는 names.json 에서 대소문자·악센트 무시로 찾는다. 찾지 못하면 임의로 만들지 말고 [질문]으로 보고한다.

## 수용 기준
1. 표 1의 29두가 표 값 그대로 들어 있고 이름이 names.json 에 있다.
2. 표 2의 39건이 설정되어 있다(검증 스크립트 출력으로 보고: 종마 이름 → 외조부 이름 39줄).
3. 기존 테스트 통과: 모든 sireKey·damsireKey 가 파일 key, 외조부 출생연도 ≤ 종마 출생연도 − 6, 부계 계통 일관성, 값 범위.
4. 현역(active) 종마 외조부 채움 비율 보고(이전 98/123).
5. `npm test && npm run typecheck && npm run lint` 통과.

## 금지
표에 없는 레코드·값 변경 금지. 금액·목장·사람·암말 이름 기록 금지. src/ 수정 금지. git commit 금지.
