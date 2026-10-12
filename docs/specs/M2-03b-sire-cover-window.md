# M2-03b 부(父) 선택에 교배 가능 기간(시작·끝) 적용

담당: haiku-coder · 선행: M2-03(데이터) · 근거: 사용자 제보(2026-10-12)

## 문제 (Opus 조사, 시드 20261011 bootstrapGame)
부를 고를 때 '교배 시작 나이'(foaled + MIN_SIRE_AGE_AT_COVER)만 보고, 사망·은퇴를 보지 않는다.
- AI 현역마 약 2,400두 중 193두(8%)가 교배 당시 25세 넘은 부: 2024년생의 부 Halo(1969년생, 54세)·Sunday Silence(2002 사망)·Unbridled(2001 사망)·Carson City·Unbridled's Song(2013 사망) 등.
- 플레이어 기초 암말: 2015년생의 부 Fappiano(1990 사망).
- 기초 암말의 어미(가상 historical): 2008년생의 부 In Reality(43세), 2011년생의 부 Bold Reasoning(42세) — 어미의 부는 historical 포함 전체에서 상한 없이 고른다.
- 원인 공통: 교배 가능 기간의 끝이 없다. 'pensioned' 는 '계류 미확인 생존'까지 포함해 사망마가 섞인다.

## 규칙
- 교배 연도 = 자마 출생 연도 − 1.
- 부 후보 조건: `foaled + MIN_SIRE_AGE_AT_COVER ≤ 교배 연도 ≤ 마지막 교배 연도`.
  - 마지막 교배 연도 = `lastCoverYear`(있으면), active 이고 없으면 제한 없음(현재까지), 그 밖(historical·pensioned 인데 값 없음)은 `foaled + MAX_STUD_AGE`(config/world.ts 새 상수, 22).
  - `availableFromYear`(해외 임대) 가 있으면 그 이전 교배 연도는 standsIn 계류 기준 후보에서 뺀다(현역 생성만 해당, 과거 출생 말은 영향 없음 — 임대 중에도 일본에서 교배는 했으므로 과거 자마의 부로는 허용).
- 공통 함수 하나로: `src/engine/world/sireWindow.ts`(신규) `canSireIn(record, coverYear, maxStudAge): boolean`, `lastCoverYearOf(record)`.
- 적용할 곳(모두 이 함수로): `src/engine/world/population.ts`(sireCandidates — 현역마 집단·연간 교체·지급마), `src/engine/state/world.ts`(기초 암말의 부, 어미의 부 — 어미의 부는 historical 포함이지만 기간 조건은 지킨다). 그 밖에 실명 종마를 부로 고르는 곳이 있으면 같이(grep `foaled <=`).
- 후보가 하나도 없으면 기존처럼 에러 대신, 조건을 '교배 연도와 가장 가까운 기간의 종마'로 완화(결정적, 난수 소비 순서 유지) — 데이터 공백 방어.

## 생성·수정할 파일
- src/engine/world/sireWindow.ts(신규), src/engine/world/population.ts, src/engine/state/world.ts, src/engine/config/world.ts(MAX_STUD_AGE)
- tests/engine/sireWindow.test.ts(신규): 함수 단위 + bootstrapGame(시드 20261011·7) 후 모든 말(현역마·기초 암말·어미·지급마)의 실명 부가 교배 가능 기간 안(lastCoverYear·MAX_STUD_AGE 기준). 연간 교체 2시즌 뒤 새 2세도 같은 검사.
- 기존 재현성 테스트(같은 시드 2회 비교)는 그대로 통과해야 한다. 고정값 기대가 깨지면 그 값만 고치고 보고.

## 수용 기준
1. 위 검사에서 기간 밖 부 0두.
2. 나라별 현역마 두수·종마 tier 분포가 크게 바뀌지 않는다(측정값 보고).
3. `npm test && npm run typecheck && npm run lint` 통과. 엔진에 Math.random·Date.now 없음, 상수는 config.

## 금지
src/engine/types 수정 금지(lastCoverYear·availableFromYear 는 이미 있음). 데이터 수정 금지. git commit 금지.
