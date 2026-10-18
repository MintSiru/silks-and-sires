# M8-R4 패독·코멘트 문구 다양화 (외부 에이전트 시범 티켓 — Antigravity 권장)

공통: AGENTS.md(=GEMINI.md), CLAUDE.md. 근거: 플레이 테스트 2회차 남은 것 2 — 연초에는 출주마 컨디션이 다 좋아 패독 문구가 대부분 '윤기가 흐르고 걸음이 가볍습니다.' 한 문장으로 같다.

## 허용 파일
src/engine/season/raceDayBrief.ts(문구 표와 문구 고르는 부분만), src/engine/config/raceDayBrief.ts(상수 추가만), tests/engine/raceDayEngine.test.ts(문구 기대값만)

## 내용
1. 패독 문구 표(PADDOCK)를 상황마다 4~6개 변형으로 늘린다(ready·normal·young·keen·timid·tired·unfit·returning). 같은 상황 안에서 고르는 것은 이미 있는 말별 스트림 `createRng(`${seed}:paddock:${horse.id}`)` 에서 한 번 더 뽑는다(새 공용 rng 소비 금지).
2. 성별·나이·털색·기질에 따라 문장 끝을 살짝 바꾸는 정도의 변주를 허용(예: 암말 '차분한 걸음', 고령마 '노련하게'). 과장·속어 금지, 경마 중계 톤의 짧은 한 문장(30자 안팎).
3. 조교사·기수 코멘트 문장 표도 상황별 2~3개 변형으로 늘린다(같은 스트림 규칙, 시드 `${seed}:comment:${horseId}` 처럼 새 이름의 파생 스트림 허용 — createRng 로 만드는 독립 스트림이라 공용 rng 불변).
4. 실명 금지(사람 이름은 넣지 않는다 — 문장에는 이름이 들어가지 않음).

## 수용 기준
- 같은 레이스 13두가 모두 'ready' 상황일 때 서로 다른 문장이 4개 이상 나온다(테스트).
- 같은 입력 같은 결과(결정성 테스트), raceDayBrief 가 상태·공용 rng 를 바꾸지 않는다(기존 테스트 통과).
- 문장 길이 45자 이하(테스트로 표 전체 검사), 실명 검색 0건.
- 검증: `npx vitest run tests/engine/raceDayEngine.test.ts`, typecheck, lint.
