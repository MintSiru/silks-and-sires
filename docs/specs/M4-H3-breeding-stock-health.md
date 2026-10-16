# M4-H3 번식 암말·종마 질환(유산·제엽염·산통)

담당: Codex(gpt-6.1-sol, high) · 설계: docs/m4-plan.md M4-H3
병행: 다른 Codex 가 M4-H12(horse/conditioning.ts, horse/injury.ts, config/injury.ts, config/conditioning.ts, season/system.ts, race/runnerModel.ts)를 진행 — 그 파일과 src/engine/state/systems.ts·src/ui 는 건드리지 말 것(시스템 등록은 Opus).

목적: 번식 암말의 유산과 종마·번식 암말의 제엽염·산통을 넣고, D9 이른 사망(질병)과 연결한다.

## 사용할 타입 (수정 금지)
- GameEvent `'mare_lost_foal' { mareId; date }`, `'stud_ailment' { horseId; ailment: 'laminitis' | 'colic'; outcome: 'recovered' | 'retired' | 'died'; date }`, `'horse_died'`, `'horse_status_changed'`, `'stallion_pensioned'`(reason 'fertility' | 'player' | 'age')
- `Mare { pregnant; dueWeek; coveredBy; coveredWeek; coveredFee? }`, `Stallion { fertility; lastSeasonYear? }`, `Horse { status; diedYear?; birthYear; ownerId }`
- 기존: stud/mortality.ts(사망 판정 30주, 말별 스트림, 사망 정리 함수), breeding/season.ts(임신·출산), createRng

## 범위
1. `src/engine/config/mortality.ts` 또는 `src/engine/config/health.ts`(신규) — 상수: 유산 `MARE_LOSS_PER_PREGNANCY = 0.06`(임신 기간 전체 확률, 주간으로 나눠 판정 — 주간 확률 = 1 − (1 − p)^(1/임신 주 수)), 나이 배수(번식 암말 18세 이상 × 1.5), 제엽염 연간 확률(15세 미만 0.005, 15세 이상 0.015, 20세 이상 0.03)과 결과 비율(회복 0.5 / 은퇴 0.3 / 사망 0.2, 회복한 종마는 fertility −0.05), 산통 연간 확률 0.02(결과 회복 0.85 / 사망 0.15). 근거 주석.
2. `src/engine/stud/health.ts`(신규) — `createBreedingHealthSystem(): WeeklySystem`(id 'breeding_health'):
   - 매주: 임신 중인 번식 암말마다 `${initialSeed}:mare-loss:${id}:${year}:${week}` 스트림으로 유산 판정 → pregnant false, dueWeek null, coveredBy·coveredFee null(종부료 환불 없음), 'mare_lost_foal'(플레이어 암말만).
   - MORTALITY_CHECK_WEEK 와 같은 주(30주)에 한 번: status 'stud'·'broodmare' 말마다 제엽염·산통 판정(각 독립 스트림). 결과 사망이면 mortality.ts 의 사망 정리와 같은 처리(status 'dead', diedYear, 소유 목록 제거, 예약·교배 정리·환불 — 공용 함수로 뽑아 쓰는 것을 권장, 이 경우 mortality.ts 수정 허용), 은퇴면 종마는 status 'retired'·lastSeasonYear = 그해, 암말은 status 'retired'. 이벤트: 플레이어 말·실명 종마만 'stud_ailment'(+ 사망이면 'horse_died' cause 'illness', 은퇴면 'horse_status_changed', 종마 은퇴면 'stallion_pensioned' reason 'age').
   - 같은 해 mortality 에서 이미 죽은 말은 건너뛴다(시스템 순서는 Opus 가 mortality 다음에 등록).
3. 필요하면 `src/engine/breeding/season.ts` 는 읽기만(임신 주 수 상수 import). 수정이 필요하면 [질문].
4. 테스트 `tests/engine/breedingHealth.test.ts`(신규).

## 수용 기준
1. 시드 고정 대량 표본(번식 암말 1만 임신)에서 유산률 6% ± 1%p, 18세 이상 암말은 약 1.5배.
2. 제엽염·산통 연간 발생률과 결과 비율이 상수 근처(표본 측정, 표로 보고).
3. 유산된 암말은 그해 출산하지 않고 다음 시즌 다시 교배 가능. 사망·은퇴한 종마는 lastSeasonYear 가 남고 예약이 정리된다.
4. 이 시스템이 없을 때와 레이스 결과가 같다(공용 난수 미사용, 52주). 같은 시드 2회 동일.
5. 시드 20261011 새 게임 10년(`it.skipIf(!process.env.VERIFY)`)에서 연평균 유산 수·제엽염/산통 건수·사망 수를 보고.
6. `npm test && npm run typecheck && npm run lint` 통과.

## 금지
src/engine/types 수정 금지. 화면 수정 금지. 병행 파일과 state/systems.ts 수정 금지. 공용 난수 사용 금지. git commit 금지. 새 의존성 금지.

## 보고 양식
```
[결과] 완료 / 부분 완료 / 실패
[변경 파일] 경로 목록
[수용 기준] 각 항목 ✅/❌ + 근거 1줄 (1·2·5 는 측정값)
[테스트] 실행 명령과 결과 요약
[명세와 다르게 한 점] 없음 / 내용과 이유
[질문] 없음 / 내용
```

## 테스트 명령
npx vitest run tests/engine/breedingHealth.test.ts && npm test && npm run typecheck && npm run lint
