# M4-ST3 가상 모마: 세일 생성 말·AI 현역마에 모마(이름 + 부) 부여

담당: Codex(gpt-6.1-sol, high) · 사용자 피드백 2026-10-16: "세일에 나오는 말들도 모마가 없어서 BMS 쪽을 볼 수가 없다." 선행: M4-ST2(지급마 모마 — 실제 Horse 레코드), M4-F1(병행 작업 트리였다면 그 뒤에 진행).

목적: 어미 Horse 레코드 없이 만들어지는 말(세일 카탈로그 생성 로트, AI 현역마 spawnRacingHorse)에 가벼운 가상 모마(이름·부·출생 연도)를 붙여, 혈통표·외조부(BMS)·니크·근친 계산과 세일 화면에서 모계를 볼 수 있게 한다. 말 레코드 수는 늘리지 않는다(세계 크기·저장 크기 보호).

## 사용할 타입 (수정 금지, 이미 추가됨)
- `Horse.virtualDam?: VirtualDam` — `VirtualDam { name; sireId; birthYear }`. damId 가 있으면 무시.
- 기존: world/population.ts `attachStarterDam`(ST2 — 모마 출생 연도 gap·부 가중 선택 규칙, 독립 스트림), `pickWeightedSire`·`filterSiresForCover`, sales/catalogue.ts `createHorse`, world/population.ts `spawnRacingHorse`(라인 ~320), breeding/pedigree.ts(`PedigreeSource`, parentNode, buildMatingPedigree), breeding/realPedigree.ts(실명 종마의 익명 모마 칸 anonDamId — 같은 방식 참고), naming/context.ts `makeNameRegistry`

## 범위
1. 가상 모마 생성 함수(공용, 예: world/virtualDam.ts): `makeVirtualDam(state, data, records, registry, horse, streamKey, homeCountry?)` — ST2 와 같은 규칙(gap·교배 가능 종마 가중·소재국 가중)으로 출생 연도·부를 정하고 이름을 만든다(registry 에 추가해 중복 방지). 난수는 독립 스트림 `${initialSeed}:${streamKey}:${horse.id}` 만.
2. 적용: 세일 생성 로트(catalogue createHorse — 'sale-dam'), AI 현역마 생성(spawnRacingHorse — 'racing-dam'). 공용 rng·기존 스트림 소비 순서는 그대로(이름 생성도 독립 스트림 rng 로). 기존 저장의 말은 그대로(마이그레이션 없음 — virtualDam 없는 말은 지금처럼 모마 없음).
3. 이름 중복: `makeNameRegistry` 가 virtualDam 이름도 등록 이름으로 본다(새 말이 같은 이름을 못 가져가게).
4. 혈통: pedigree.ts 조회가 damId 가 null 이고 virtualDam 이 있으면 모마 칸을 만든다(이름·출생 연도, 부 = virtualDam.sireId 로 위로 계속 확장 — 실명 종마면 realPedigree 경로). 근친·니크(외조부 계통)·배합 미리보기·자마 생성(genetics)에서 모부(damsire)가 이 값으로 잡힌다. 암말 이름은 가상 이름이므로 원칙 1 문제 없음.
5. 화면: 세일 로트 상세·말 카드 혈통표에 모마 이름·외조부가 보인다(기존 PedigreeView 가 위 조회를 쓰면 자동). 세일 카탈로그 목록에 '부 × 모부(외조부)' 열이 없으면 추가.
6. 테스트: `tests/engine/virtualDam.test.ts` — 결정성, 공용 rng 불변, 세일 로트·AI 현역마에 virtualDam 존재, 혈통 조회에서 외조부가 virtualDam.sireId, 이름 중복 없음, 저장·불러오기 왕복.

## 수용 기준
1. 시드 고정 새 게임: AI 현역마 전부와 첫 세일 생성 로트 전부에 virtualDam 이 있고, 이름이 전역 중복 없음.
2. 공용 rng 상태는 이 티켓 전과 같다. 말 이름·능력은 이름 레지스트리 변화로 바뀔 수 있다 — 바뀐 고정 해시 테스트와 이유 보고 후 값만 갱신.
3. 혈통 조회·외조부·근친 계산에 가상 모마 경로가 반영된다(단위 테스트).
4. 세계 말 레코드 수는 이 티켓 전과 같다.
5. `npm test && npm run typecheck && npm run lint && npm run build` 통과. 시드 20261011 1시즌 진행 시간 증가 10% 이하(측정 보고).

## 금지
src/engine/types 수정 금지(필요하면 [질문]). 공용 rng 소비 순서 변경 금지. 가상 모마 이름에 실명 금지(기존 이름 생성기만 사용). 새 의존성 금지. git commit 금지.

## 보고 양식
```
[결과] 완료 / 부분 완료 / 실패
[변경 파일] 경로 목록
[수용 기준] 각 항목 ✅/❌ + 근거 1줄 (5 는 측정값)
[테스트] 실행 명령과 결과 요약
[명세와 다르게 한 점] 없음 / 내용과 이유
[질문] 없음 / 내용
```

## 테스트 명령
npx vitest run tests/engine/virtualDam.test.ts && npm test && npm run typecheck && npm run lint && npm run build
