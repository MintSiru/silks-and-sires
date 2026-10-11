# M2-17 배합 화면 역할 힌트 표시

담당: haiku-coder · 선행: M2-16 승인

## 목적
배합 미리보기에 '스피드 담당 / 스태미나 담당' 역할과 보완형 가능성을 보여 준다(docs/stamina-and-nh.md 4-3).

## 생성·수정할 파일
1. `src/ui/breeding/BreedingScreen.tsx`
   - buildMatingPreview 호출에 `damsire: mare.sireId === null ? null : (state.horses[mare.sireId] ?? null)` 를 넘긴다.
   - 미리보기 `<dl>` 에 두 줄 추가(닉스 아래):
     - "역할": `부마 {matingRoleKo(roles.sire)} · 모계 {matingRoleKo(roles.damSide)}`
     - "보완형": `complementKo(complement)` — 'likely' 이면 강조 스타일(기존 comment--good 등 재사용)
2. `src/ui/game/text.ts` — export 두 개:
   - `matingRoleKo(r: MatingRole | 'unknown'): string` — speed "스피드 담당", balanced "균형형", stamina "스태미나 담당", unknown "미상"
   - `complementKo(c: MatingPreview['complement']): string` — likely "보완형 배합 (부마 스피드 + 모계 스태미나)", unlikely "보완형 아님", unknown "판단 불가 (외조부 미상)"
3. `tests/ui/gameText.test.ts` — 두 함수의 모든 값 매핑 테스트.

## 수용 기준
1. 모든 MatingRole·complement 값에 서로 다른 한국어 문구.
2. 화면에 숫자 능력치가 새로 나오지 않는다.
3. `npm run build`, typecheck, lint, npm test 통과(단 tests/data 는 다른 티켓 진행 중이라 실패할 수 있음 — 그 경우 보고에 적기).

## 금지
src/engine, data/ 수정 금지. git commit 금지.

## 테스트 명령
`npm test && npm run typecheck && npm run lint && npm run build`
