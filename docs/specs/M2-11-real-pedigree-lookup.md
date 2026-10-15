# M2-11 실명 종마 혈통의 모계 연결(이름 없는 모마 칸)

담당: haiku-coder · 선행: 286e4dd(RealStallionRecord.femaleLineSireKeys) · 근거: 사용자 피드백(2026-10-12 "5대 혈통표가 너무 비어 있음"), 사용자 결정(2026-10-15 "5대조 채우기, 1~2티어부터")

## 문제
실명 종마의 Horse 레코드는 `damId: null` 이라(암말 실명 저장 금지 — 원칙 1), 데이터의 `damsireKey` 가 있어도 혈통표·인브리드 계산에서 모계가 통째로 빠진다.

## 해결: 이름 없는 모마 칸을 조회 시점에 만든다(상태에 저장하지 않음)
`src/engine/breeding/realPedigree.ts`(신규):
- `export const ANON_DAM_PREFIX = '~dam:'`, `anonDamId(recordKey, level)` = `~dam:${key}:${level}`(level 1~4), `isAnonDamId(id): boolean`.
- `export function createPedigreeLookup(horses: Readonly<Record<HorseId, Horse>>, records: readonly RealStallionRecord[]): PedigreeLookup`
  - 레코드 표는 records 배열 기준으로 한 번 만들고 WeakMap 캐시(같은 배열이면 재사용).
  - 실명 종마(horses[id] 가 있고 id 가 레코드 key): `{ id, sireId: horse.sireId, damId: record.damsireKey ? anonDamId(key, 1) : null }`.
  - 모마 칸 `~dam:K:n`: sireId = n === 1 ? damsireKey : femaleLineSireKeys[n − 2] ?? null, damId = (n < 4 이고 femaleLineSireKeys[n − 1] 이 있으면) `~dam:K:${n+1}` 아니면 null. 부 키가 null 인 모마 칸도 노드로는 존재한다(부 칸만 빈다) — 단 그 아래가 전부 비면 damId null.
  - 그 밖의 말: horses[id] 그대로.
  - 모마 칸의 부(sireId)가 가리키는 실명 종마 Horse 가 horses 에 없으면 그 부는 null 로(조회 실패 방지).
- 인브리드: 모마 칸 id 는 레코드마다 달라 서로 겹치지 않는다(같은 실제 암말이라도 공통 조상으로 잡히지 않음 — 알려진 한계, 주석으로 남김). 모마 칸의 부(실명 종마)는 정상적으로 겹침이 잡힌다.

## 적용 지점(모두 createPedigreeLookup 으로 바꾼다)
- `src/engine/breeding/season.ts`(수태·자마 생성의 lookup), 미리보기(`src/engine/breeding/preview.ts` 를 부르는 쪽 — 호출자가 lookup 을 넘기면 호출자를), `src/ui/breeding/BreedingScreen.tsx` 의 혈통표 lookup. 그 밖에 `(id) => state.horses[id]` 로 PedigreeLookup·HorseLookup 을 만드는 곳을 grep 해서 혈통·인브리드 용도면 모두.
- 각 지점에서 레코드는 이미 쓰는 정적 데이터(stallionRecords)를 넘긴다. 없으면 `getStallionRecords()`(UI)·시스템 정적 데이터에 이미 있는 값을 쓴다 — 새 정적 데이터 필드를 만들지 말 것(필요하면 보고).
- 화면: 혈통표에서 모마 칸 이름은 '—'(이름 미기록 암말)로, 그 부는 정상 표기. 기존 빈칸 표기 규칙과 같게.

## 생성·수정할 파일
- src/engine/breeding/realPedigree.ts(신규), src/engine/breeding/season.ts, src/ui/breeding/BreedingScreen.tsx (+ 미리보기 호출자 1곳이 따로 있으면 그 파일)
- tests/engine/realPedigree.test.ts(신규)

## 수용 기준
1. 단위: damsireKey 만 있는 레코드 → 1대 모마 칸 생성, 그 부 = damsire. femaleLineSireKeys [A, null, C] → 2대 모마(부 A)·3대 모마(부 null)·4대 모마(부 C) 연결. damsireKey null → damId null.
2. 시드 20261011 상태에서 Frankel(또는 데이터의 등급 1 종마 하나)의 5대 혈통표: 이 티켓 전보다 실존 노드 수가 늘었음을 수치로 보고(전·후).
3. 인브리드: 부·모 양쪽 혈통에 같은 외조부가 나오는 테스트 교배에서 그 종마가 공통 조상으로 잡힌다(이전에는 안 잡힘).
4. 같은 입력 → 같은 결과, 상태(state.horses) 불변(모마 칸을 저장하지 않음).
5. `npm test && npm run typecheck && npm run lint && npm run build` 통과. 혈통·인브리드 값이 바뀌어 깨지는 고정값 테스트는 원인이 모계 연결뿐인지 확인한 뒤 기대값만 고치고 목록 보고.

## 금지
src/engine/types 수정 금지. data/ 수정 금지(다른 에이전트가 data/stallions 작업 중). src/engine/betting·season/raceday.ts·data/staticData.ts 는 다른 작업자(Codex)가 수정 중 — 건드리지 말 것. git commit 금지.

## 테스트 명령
npx vitest run tests/engine/realPedigree.test.ts && npm test && npm run typecheck && npm run lint && npm run build
