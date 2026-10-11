# M2-01e 현역 종마 외조부(BMS) 채우기

담당: haiku-data · 선행: M2-01d 승인

## 목적
현역(active) 종마의 damsireKey 를 채워 망아지 혈통표 4~5대의 공백과 근친 누락을 줄인다.

## 범위
- 대상: status 'active' 이고 damsireKey 가 null 인 종마(약 70두). 시간이 남으면 pensioned.
- 근거: 위키백과 인포박스의 Damsire(또는 Dam 의 sire) 값. 요청 간 3초, 429 면 60초 대기. 제목은 "이름 (horse)" 등도 시도.

## 규칙
1. 외조부가 파일에 이미 있으면 damsireKey 만 연결.
2. 없으면 외조부를 **조상 레코드로 추가**한다: 출생연도·출생국·부를 위키백과로 확인하고, 부를 따라 기존 파일에 닿을 때까지 사슬을 잇는다(사슬 확인이 끊기면 그 조상 sireKey null + 미확인 고리). 조상 status 는 사망 확인 시 historical, 아니면 pensioned. standsIn null, tier 5, distance 는 주요 우승 거리(없으면 speed + low).
3. 외조부를 위키백과에서 찾지 못하면 null 유지, _review.md 의 "BMS 미확인" 표에 종마 이름만 적는다(사용자에게 받을 목록).
4. 암말 이름은 저장하지 않는다(외조부 = 종마만). 사람·목장·레이스 이름과 금액 금지.
5. 새 조상은 기존 계통 트리에 붙인다. 계통 신설은 최소화하고 신설하면 _review 에 이유.

## 생성·수정할 파일
1. `data/stallions/stallions.json`, `names.json`, `sire_lines.json`(필요 시)
2. `data/stallions/_review.md` (M2-01e 섹션: 연결 목록, 추가 조상, BMS 미확인 표)
3. `tests/data/stallions.test.ts` — 현역 종마 중 damsireKey 가 있는 비율 ≥ 60% 검사 추가, damsireKey 는 모두 존재하는 key 를 가리킴(기존 검사 확인)

## 수용 기준
1. 현역 BMS 채움 비율 ≥ 60% (현재 약 40%).
2. 모든 damsireKey 가 파일 안의 key 를 가리키고, 외조부 출생연도 ≤ 종마 출생연도 − 6.
3. 금지어 grep 0건(M2-01d 명세의 명령과 같음).
4. `npm test && npm run typecheck && npm run lint` 통과.

## 금지
src/ 수정 금지, git commit 금지, 지어내기 금지.
