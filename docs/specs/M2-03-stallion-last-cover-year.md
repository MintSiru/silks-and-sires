# M2-03 종마 마지막 교배 연도(사망·종마 은퇴) 데이터

담당: haiku-data · 근거: 사용자 제보(2026-10-12) — 기본 지급 11세 암말(2015년생)의 부가 Fappiano(1990 사망). 생성 단계가 부의 '교배 시작 나이'만 보고 사망·은퇴를 보지 않았다.

## 목적
비현역 종마(historical 124, pensioned 61)에 `lastCoverYear`(마지막 교배 시즌 = 사망 연도 또는 종마 은퇴 연도)를 채운다. 엔진 수정은 별도 티켓(M2-03b).

## 규칙
- 타입: `RealStallionRecord.lastCoverYear?: number`(Opus 가 추가함).
- historical(사망): 위키백과 인포박스 `died` 의 연도. 사망 연도 그해 봄 시즌까지 교배했다고 보고 그 연도를 그대로 넣는다.
- pensioned: 위키백과에 종마 은퇴(pensioned·retired from stud) 연도가 있으면 그 연도, 사망했으면 사망 연도(그리고 status 를 historical 로 정정 — 이 경우만 status 변경 허용, _review 에 기록). 둘 다 없으면 생략.
- active: 넣지 않는다.
- 조회: `https://en.wikipedia.org/w/index.php?title=<제목>&action=raw`, 요청 간격 3초 이상, 429 면 30초 쉬고 재시도. 출생연도로 같은 말 확인(동명마 주의). 원문·스크립트는 /tmp 아래에만.
- 확인 안 되는 레코드는 생략하고 _review.md 의 '확인 필요' 표에 올린다(추측 금지).

## 생성·수정할 파일
- data/stallions/stallions.json, data/stallions/_review.md(새 절: 채운 수·확인 필요 표·status 정정 목록)
- tests/data/stallions.test.ts — 검사 추가: lastCoverYear 가 있으면 foaled + 3 이상 2026 이하, active 에는 없음.

## 수용 기준
1. 비현역 185건 중 가능한 만큼 채우고(채운 수·비율 보고), 확인 필요 목록을 따로 낸다.
2. 데이터 테스트 통과, `npm test && npm run typecheck && npm run lint` 통과.

## 금지
src/ 수정 금지(테스트 제외). active 레코드 수정 금지. git commit 금지.
