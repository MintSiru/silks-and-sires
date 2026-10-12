# M3-C7e2 이름 생성기 게임 연결

담당: haiku-coder · 선행: M3-C7d 승인(0a5dac3), M3-C7e1 승인

## 목적
게임에서 말 이름을 짓는 모든 곳(세계 생성의 기초 암말·조상 암말, 현역마 집단, 새 게임 지급 현역마, 망아지 출산)을 새 이름 생성기(nameForHorse)로 바꾼다. 마주 국적 언어·마주 스타일·부모 이름 연상·실제 지명·역사 인물·붙여 쓰기가 실제 게임 말 이름에 나오게 한다.

## 사용할 것 (수정 금지)
`nameForHorse`·`pickOwnerStyle`·`normalizeName`(engine/naming), `LANGUAGE_BY_COUNTRY`(config/naming.ts), `getNamingData`(data/staticData.ts), `NamingData`, `Owner`(country, namePrefix), 종마 이름표 `getStallionNames()`

## 생성·수정할 파일
1. `src/engine/naming/context.ts` (신규) — `namingContextFor(state, args: { ownerId: OwnerId | null; sireId: HorseId | null; damId: HorseId | null }, data: { naming: NamingData; stallionNames: Record<string, string> }): NamingContext`
   - 부·모 이름: state.horses[id].name, 없으면 stallionNames[id](실명 종마 key), 그래도 없으면 null
   - 마주 없음(기초 암말 등)이면 language 'en', 스타일은 pickOwnerStyle('world', null)
   - tributeNames: state.jockeys·trainers 이름의 성(마지막 단어) 중 정렬 후 앞 40개
   - `makeNameRegistry(state): NameRegistry & { add(name) }` — 현재 모든 말 이름(normalizeName)으로 만든다
2. `src/engine/world/population.ts`·`src/engine/state/world.ts`·`src/engine/breeding/season.ts` — generateHorseName 호출을 namingContextFor + nameForHorse 로 바꾼다. 이름을 정한 뒤 레지스트리에 add. 정적 데이터 인터페이스(RacingPopulationStaticData, WorldStaticData, BreedingStaticData)의 `words: HorseWords` 를 `naming: NamingData; stallionNames: Record<string, string>` 로 바꾼다.
3. `src/engine/data/staticData.ts`·`src/ui/game/useGame.ts`·이 데이터를 만드는 테스트 헬퍼 — 위 인터페이스 변경에 맞춰 naming·stallionNames 를 넘긴다.
4. 이름 생성기로 다 바뀌면 `generateHorseName` 과 `data/names/horse_words.json`, `HorseWords` 사용처를 정리한다(남은 사용처가 없으면 삭제, 테스트에서만 쓰면 테스트도 정리).
5. 테스트: `tests/engine/namingIntegration.test.ts` (신규) — 아래 기준. 기존 재현성 테스트는 같은 시드 2회 비교 방식이면 그대로 통과해야 한다. 이름 문자열을 고정값으로 기대하는 테스트가 있으면 그 기대값만 고치고 보고.

## 수용 기준
1. bootstrapGame(시드 20261011) 후 모든 말 이름이 validateHorseName 통과, 중복 0, 실명 종마 이름과 같은 것 0.
2. 현역마 중 FR 마주 소유 말 이름의 프랑스어 단어 비율 ≥ 0.5, AE 마주 소유 말 ≥ 0.6, GB 마주 소유 말은 외국어 모국어 모드 0(C7d 엄격 기준).
3. 망아지 출산(advance 로 출산 주까지 진행) 후 플레이어 망아지 이름이 생성기 출처(혈통 연상 포함 가능)이고 레지스트리 중복 없음.
4. 같은 시드 2회 bootstrap·advance 결과 toEqual. 저장 왕복 통과.
5. bootstrapGame 시간이 기존 대비 +30% 이내(측정값 보고).
6. 엔진에 Math.random·Date.now 없음. `npm test && npm run typecheck && npm run lint && npm run build` 통과.

## 금지
src/engine/types 수정 금지. data/naming·data/people 수정 금지. UI 화면 변경 금지(useGame 의 데이터 연결만). git commit 금지.
