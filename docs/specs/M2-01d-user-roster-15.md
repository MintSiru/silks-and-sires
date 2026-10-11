# M2-01d 사용자 제공 종마 15두 추가 (스테이어·NH 포함)

담당: haiku-data · 선행: M2-01c 승인 · 근거: 사용자 제공(2026-10-11)

## 목적
사용자가 준 15두(Daryz 는 기존 레코드 갱신)를 넣고, 거리 프로필 cup(장거리)·NH 종마를 처음으로 갖춘다.

## 공용 타입 (Opus 가 추가함 — 수정 금지)
`RealStallionRecord.studRole?: 'flat' | 'dual' | 'nh'` (생략 = flat). 사용자가 "Turf NH" 라고 한 종마는 'nh'.

## 원칙
- 데이터에 넣는 것은 아래 필드뿐. 사람·마주·스터드·레이스 이름과 금액은 어디에도 쓰지 않는다(_review.md 포함). 근거 칸은 "사용자 제공(2026-10-11)" + 등급·거리.
- damsire 는 파일에 그 종마가 있으면 연결, 없으면 null(이번 티켓에서 외조부를 새로 추가하지 않는다 — 별도 티켓 M2-01e).
- 사용자 표기 "GE" 는 조지아가 아니라 독일(DE)로 해석한다(Intello, Sea The Moon — 둘 다 독일산).
- 계류국은 사용자가 준 통화로 추정: £ → GB. € 는 아래 표의 값(Opus 판단, confidence medium).
- tier 는 금액 숫자 기준: ≥100k→1, 50k+→2, 25k+→3, 10k+→4, <10k→5, 미정(TBA)→4.

## 추가·갱신할 15두
| key | 이름 | 출생 | 국 | 부(sireKey) | 모부(있으면 연결) | standsIn | tier | distance | surface | studRole |
|---|---|---|---|---|---|---|---|---|---|---|
| stl_ace_impact | Ace Impact | 2020 | IE | Cracksman(기존) | Anabaa Blue | FR | 3 | classic | turf | flat |
| stl_sealiway | Sealiway | 2018 | FR | Galiway(신규 조상) | Kendargent | FR | 4 | classic | turf | flat |
| stl_intello | Intello | 2010 | DE | Galileo(기존) | Danehill(기존) | FR | 5 | classic | turf | flat |
| stl_puchkine | Puchkine | 2021 | FR | Starspangledbanner(기존) | So You Think | FR | 5 | speed | turf | flat |
| stl_stunning_spirit | Stunning Spirit | 2014 | GB | Invincible Spirit(기존) | Dynaformer | FR | 5 | speed | turf | flat |
| stl_daryz (**기존 갱신**) | Daryz | 2022 | **FR** | Sea The Stars | Selkirk | FR | 4 | **middle** | turf | flat |
| stl_sea_the_moon | Sea The Moon | 2011 | DE | Sea The Stars(기존) | Monsun | GB | 4 | middle | turf | flat |
| stl_los_angeles | Los Angeles | 2021 | IE | Camelot(기존) | Dansili(기존) | IE | 5 | classic | turf | nh |
| stl_kyprios | Kyprios | 2018 | IE | Galileo(기존) | Danehill(기존) | IE | 5 | cup | turf | nh |
| stl_stradivarius | Stradivarius | 2014 | IE | Sea The Stars(기존) | Bering | GB | 4 | cup | turf | flat |
| stl_order_of_st_george | Order of St George | 2012 | IE | Galileo(기존) | Gone West(기존) | IE | 5 | cup | turf | nh |
| stl_bradsell | Bradsell | 2020 | GB | Tasleet(신규 조상) | Archipenko | GB | 4 | speed | turf | flat |
| stl_diego_velazquez | Diego Velazquez | 2021 | IE | Frankel(기존) | Acclamation(기존) | GB | 4 | speed | turf | flat |
| stl_aesterius | Aesterius | 2022 | IE | Mehmas(신규 조상) | Hallowed Crown | GB | 5 | speed | turf | flat |
| stl_dream_ahead | Dream Ahead | 2008 | GB | Diktat(신규 조상) | Cadeaux Genereux | GB | 5 | speed | turf | flat |

판정 메모(Opus): Sealiway(G1 1,400·2,004m)·Ace Impact(G1 2,100·2,400m)·Los Angeles(G1 2,000·2,100·2,400m)는 classic, Daryz(G1 2,400m×2)·Sea The Moon 은 middle, Kyprios·Stradivarius·Order of St George 는 cup. Daryz 의 이전 cup(M2-15 본문 근거, low)은 사용자 정보로 대체한다.

## 신규 조상 (위키백과 확인, 요청 간 3초·429 면 60초 대기, 기존 파일에 닿으면 멈춤)
- Galiway ← Galileo(기존) — 사용자 제공("sired by Galileo"). 출생연도·국은 위키백과로, 없으면 Sealiway 문서 혈통표에서. 확인 안 되면 Sealiway.sireKey null + 미확인 고리.
- Tasleet ← Showcasing ← Oasis Dream(기존)
- Mehmas ← Acclamation(기존)
- Diktat ← Warning ← … (기존 파일에 닿을 때까지)
- 조상은 status historical(사망 확인)/pensioned, standsIn null, tier 5, distance 는 주요 우승 거리, 확인 안 되면 speed + low.

## 생성·수정할 파일
1. `data/stallions/stallions.json`, `names.json`, `sire_lines.json`(필요 시)
2. `data/stallions/_review.md` (M2-01d 섹션)
3. `tests/data/stallions.test.ts` — studRole 값 검사(있으면 flat/dual/nh 중 하나), nh 종마 ≥ 3, cup 종마 ≥ 3.

## 수용 기준
1. 15두가 표의 값과 일치(Daryz 는 갱신).
2. names 키 집합 = stallions 키 집합.
3. 금지어 grep 0건: `grep -inE "coolmore|darley|godolphin|juddmonte|aga khan|wertheimer|haras |stud farm|o'brien|gosden|fabre|stakes|derby|guineas|gold cup|prix |[\$€£][0-9]" data/stallions/_review.md data/stallions/*.json` (종마 이름 자체 예외는 _review 에 표시)
4. `npm test && npm run typecheck && npm run lint` 통과.

## 금지
src/ 수정 금지(타입 포함), git commit 금지.
