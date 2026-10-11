# M2-01c 사용자 제공 종마 16두 추가

담당: haiku-data · 선행: M2-15 승인 · 근거: 사용자 제공 정보(2026-10-11), 2026 명단(M2-01b 명세 그룹 A~H)

## 목적
M2-01b 에서 위키백과로 확인하지 못한 명단 종마 16두를 사용자 제공 정보로 넣고, 끊긴 부계 고리(Munnings ← …)를 잇는다.

## 원칙
- 데이터에 넣는 것은 아래 표의 필드뿐이다. 사용자 정보에 있던 사람·마주·조교사·스터드·레이스 이름, 종부료 금액, 상금, 경매가는 **어디에도 쓰지 않는다**(_review.md 포함).
- _review.md 근거 칸: "사용자 제공(2026-10-11)" + 등급·거리(예: "G1 1,600m")만.
- 표에서 "확인" 표시된 고리는 위키백과로 확인한다(요청 간 3초, 429 면 60초 대기). 확인되면 연결, 안 되면 null + "미확인 고리".
- damsire 는 파일에 그 종마가 있을 때만 연결, 없으면 null(새로 추가하지 않는다).
- 모두 status active, confidence: 사용자가 명시한 항목만이면 high, 표에 (추정)이 있으면 medium.

## 추가할 16두 (distanceProfile 은 M2-14 4단계)
| key | 이름 | 출생 | 출생국 | 부(sireKey) | 모부(damsireKey) | standsIn | tier | distance | surface |
|---|---|---|---|---|---|---|---|---|---|
| stl_henri_matisse | Henri Matisse | 2022 | IE (추정) | Wootton Bassett | Pivotal | IE | 4 | speed | turf |
| stl_henry_longfellow | Henry Longfellow | 2021 | IE (추정) | Dubawi | Galileo (추정: 모 Minding 의 부) | IE | 4 | speed | turf |
| stl_sioux_nation | Sioux Nation | 2015 | US | Scat Daddy | null | IE | 3 | speed | turf |
| stl_the_antarctic | The Antarctic | 2020 | IE (추정) | Dark Angel | null | IE | 5 | speed | turf |
| stl_domestic_product | Domestic Product | 2021 | US | Practical Joke | Paynter(파일에 있으면) | US | 3 | speed | dirt |
| stl_echo_town | Echo Town | 2017 | US | Speightstown | null | US | 5 | speed | dirt |
| stl_mo_town | Mo Town | 2014 | US | Uncle Mo (확인: Uncle Mo 항목 자마 목록) | null | US | 5 | speed | both |
| stl_munnings | Munnings | 2006 | US | Speightstown (확인: Speightstown 항목 자마 목록) | null | US | 3 | speed | dirt |
| stl_territories | Territories | 2012 | IE | Invincible Spirit | Machiavellian | GB | 4 | speed | turf |
| stl_triple_time | Triple Time | 2019 | IE | Frankel | null | GB | 4 | speed | turf |
| stl_enticed | Enticed | 2015 | US | Medaglia d'Oro | null | US | 5 | speed | dirt |
| stl_mystic_guide | Mystic Guide | 2017 | US | Ghostzapper | A.P. Indy(파일 key 확인) | US | 4 | classic | dirt |
| stl_proxy | Proxy | 2018 | US | Tapit | null | US | 3 | classic | dirt |
| stl_speakers_corner | Speaker's Corner | 2018 | US | Street Sense | Bernardini | US | 4 | speed | dirt |
| stl_bated_breath | Bated Breath | 2007 | GB | Dansili | null | GB | 5 | speed | turf |
| stl_lead_artist | Lead Artist | 2021 | GB | Dubawi | Frankel | GB | 4 | speed | turf |

tier 규칙(명단 금액 숫자 기준): ≥100k→1, 50k+→2, 25k+→3, 10k+→4, <10k→5.
Territories·Speaker's Corner 는 사용자 결정으로 2026 명단대로 현역(해외 이적 기록은 쓰지 않는다).

## 새 조상 (위키백과 확인 후 추가, 기존 파일에 닿으면 멈춤)
- Speightstown (1998, US) ← Gone West(기존)
- Ghostzapper (2000, US) ← Awesome Again ← Deputy Minister ← … (기존 파일에 닿을 때까지)
- 그 밖에 표의 부가 파일에 없으면 같은 방식으로 추가.
- 기존 Jack Christopher 의 sireKey 를 stl_munnings 로 연결(Munnings 가 확인·추가되면).

## 생성·수정할 파일
1. `data/stallions/stallions.json`, `data/stallions/names.json`, `data/stallions/sire_lines.json`(필요 시)
2. `data/stallions/_review.md` (M2-01c 섹션)
3. `tests/data/stallions.test.ts` — 부계 깊이 예외 상수에서 해소된 종마 제거

## 수용 기준
1. 16두 모두 존재, 표의 값과 일치.
2. names.json 키 집합 = stallions.json 키 집합.
3. Jack Christopher 부계 깊이 ≥ 5 (Munnings 연결 성공 시) — 실패 시 예외 목록 유지 + _review 기록.
4. 금지어 grep 0건: `grep -inE "coolmore|darley|godolphin|juddmonte|ashford|jonabell|castlehyde|dalham|banstead|rosemont|o'brien|pletcher|asmussen|gosden|fabre|stakes|derby|guineas|world cup|gold cup|[\$€£][0-9]" data/stallions/_review.md data/stallions/*.json` (종마 이름 자체에 걸리는 경우만 예외로 _review 에 표시)
5. `npm test && npm run typecheck && npm run lint` 통과.

## 금지
src/ 수정 금지, git commit 금지.
