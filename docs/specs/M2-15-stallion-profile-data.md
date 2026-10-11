# M2-15 실명 종마 거리 프로필 재분류

담당: haiku-data · 선행: M2-14 승인 · 근거: docs/stamina-and-nh.md 3장

## 목적
data/stallions/stallions.json 의 모든 종마 `distanceProfile` 을 현역 시절 실제 주력 거리로 다시 분류한다(M2-14 의 기계적 변환은 mile→speed 로 뭉뚱그렸다).

## 분류 규칙
현역 시절 **가장 높은 등급 우승(G1 우선, 없으면 G2·G3)이 몰린 거리**로 정한다.
- speed: 주력 우승 거리 ≤ 9f (~1,800m) — 스프린터·마일러
- classic: 9f 초과 ~ 11f (~2,200m) — 10f 중심
- middle: 11f 초과 ~ 13.5f (~2,700m) — 12f 중심
- cup: 13.5f 초과 — 14f 이상 장거리
- 둘에 걸치면 G1 우승 수가 많은 쪽. 같으면 더 짧은 쪽.
- 현역 기록이 거의 없는 historical 계통 시조는 기존 값을 유지하고 confidence 를 바꾸지 않는다.

## 생성·수정할 파일
1. `data/stallions/stallions.json` — distanceProfile 만 수정(다른 필드 금지)
2. `data/stallions/_review.md` — 표 추가: key / 이전 값 / 새 값 / 근거 거리·레이스 등급(레이스명 쓰지 말고 "G1 2,400m" 식으로) / 확신도
3. `tests/data/stallions.test.ts` — 분포 검사 추가: 4개 프로필이 모두 1두 이상, active 종마 중 classic ≥ 10%

## 조사
en.wikipedia.org 조회 허용(.claude/settings.json). 실제 레이스명·인물·목장·회사 이름은 **데이터와 _review.md 에 쓰지 않는다**. 거리와 등급만 적는다.

## 수용 기준
1. 모든 종마가 4개 값 중 하나.
2. _review.md 에 바뀐 모든 종마의 근거 줄이 있다.
3. 실명 위반 0건: `grep -iE "stakes|derby|oaks|guineas|cup |prix|coolmore|darley|godolphin|juddmonte|tattersalls|goffs|arqana" data/stallions/_review.md data/stallions/stallions.json` 결과 없음(종마 이름 자체에 포함된 경우는 예외로 _review.md 에 표시).
4. `npm test` 통과.

## 금지
src/ 수정 금지, 다른 필드 수정 금지, git commit 금지.

## 테스트 명령
`npm test && npm run typecheck && npm run lint`
