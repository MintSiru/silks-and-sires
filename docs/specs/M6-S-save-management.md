# M6-S 저장 관리

담당: Haiku(Codex 주간 사용량 부족 — 사용자 2026-10-17) · 근거: 30년 저장 28MB(docs/reports/M5-G-30year.md), docs/m6-plan.md · 티켓 S1·S2 병렬 → S3 → S4 순서

목적: 오래 플레이해도 저장·불러오기가 빠르고 안전하게, 여러 슬롯과 파일 내보내기를 지원한다.

## 공용 인터페이스 (Opus 가 이미 추가 — 수정 금지)
- src/ui/storage/saveStore.ts: `SaveSlotMeta.bytes?: number`(저장된 데이터 바이트, 압축했으면 압축 크기), `AUTOSAVE_SLOT_ID = 'autosave'`, `MANUAL_SLOT_IDS = ['slot-1','slot-2','slot-3']`, `ManualSlotId`. `SaveStore` 인터페이스(list·save·load·remove — 시그니처 그대로, load 는 계속 JSON 문자열을 돌려준다).
- 엔진: src/engine/save/serialize.ts `serializeGame`·`deserializeGame`(마이그레이션·검증 포함)·`validateGameState`. 엔진 수정 금지.

## 공통
- 작업 트리: 깨끗하면 `git checkout --detach <기준 커밋>` 후 `ln -s /home/user/silks-and-sires/node_modules node_modules`.
- 게임 규칙 변경 금지, 새 의존성 금지(브라우저·Node 내장 `CompressionStream`/`DecompressionStream`, 테스트에서 `node:zlib` 는 허용), src/engine 수정 금지, git commit 금지, 실명 금지.
- 오류 문구는 한국어. 쓰기 실패 때 기존 저장을 지우지 않는다.
- 검증: 해당 테스트 + `npx vitest run tests/ui --testTimeout=180000 --hookTimeout=180000`, typecheck, lint, build, `node tests/ui/ux2-shell.smoke.mjs` PASS.
- 보고: CLAUDE.md 보고 양식.

## S1 압축 저장 계층 (haiku-coder)
허용: src/ui/storage/compress.ts(신규), src/ui/storage/saveStore.ts(구현부만 — 공용 인터페이스 줄 수정 금지), tests/ui/compress.test.ts(신규), tests/ui/saveStore.test.ts, tests/ui/ux2-shell.smoke.mjs·tests/ui/capture-screens.mjs(저장본 주입 코드만)
1. compress.ts: `canCompress(): boolean`(globalThis.CompressionStream·DecompressionStream 존재), `gzipText(text: string): Promise<Uint8Array>`, `gunzipText(bytes: Uint8Array): Promise<string>`, `isGzip(bytes: Uint8Array): boolean`(1f 8b 매직).
2. IndexedDB 구현: 데이터 레코드 `{ id; json?: string; gz?: Uint8Array }`. canCompress 면 gz 로, 아니면 json 으로 저장. load 는 둘 다 읽어 문자열 반환(옛 `{id, json}` 레코드 그대로 불러옴). meta.bytes 에 실제 저장 바이트(gz 길이 또는 UTF-8 바이트) 기록. 메모리 구현도 bytes 기록.
3. 쓰기 실패: meta·data 를 한 트랜잭션으로(이미 그렇다) — 실패 시 이전 레코드 유지됨을 테스트. 오류를 `SaveStoreError`(code: 'quota' | 'unavailable' | 'unknown', 한국어 message — 예 '저장 공간이 부족합니다. 다른 칸을 지우거나 파일로 내보내세요.')로 감싸 던진다(QuotaExceededError 판별).
4. 스모크·촬영 스크립트의 IndexedDB 저장본 주입 코드: 레코드가 gz 면 페이지 안에서 DecompressionStream 으로 풀고, 고친 뒤 CompressionStream 으로 다시 gz 로 쓴다(json 레코드면 지금처럼).
5. 테스트: 압축 왕복(긴 문자열 크기 감소), 압축 불가 환경(전역 제거) json 대체, 옛 json 레코드 불러오기, bytes 기록, 쓰기 실패 시 기존 유지·SaveStoreError 문구.

## S2 저장 크기 측정 (haiku-tester)
허용: tests/verify/saveSize.test.ts(신규), docs/reports/M6-S-size.md(신규)
1. `SAVE_SIZE_OUT=<파일>` 이 있을 때만 도는 측정 테스트(없으면 skip): 새 게임 → `SAVE_SIZE_YEARS`(기본 30)년 무입력 진행(기존 tests/verify/g1ThirtyYears.test.ts 의 진행 방식 재사용, advanceWeeksGated·연말 결정 처리 참고) → 5·10·20·30년차에 serializeGame 결과의 전체 바이트, 최상위 필드별 JSON 바이트(상위 15개), node:zlib gzipSync 크기·비율을 JSON 으로 기록.
2. 30년 실행(백그라운드, 15~30분) 결과로 docs/reports/M6-S-size.md 작성: 표(연차별 원본·압축·비율, 30년차 필드별 상위 15), 압축 목표(원본 25% 이하) 판정, 큰 필드 보존 정책 관찰(규칙 변경 제안은 [질문]으로만).

## S3 저장 칸 (S1 뒤)
허용: src/ui/game/useGame.ts(저장 부분), src/ui/shell/SettingsModal.tsx, src/ui/shell/saveSlotsView.ts(신규), src/ui/shell/shell.css, tests/ui/saveSlots.test.ts(신규), tests/ui/shellSettings.test.ts, tests/ui/ux2-shell.smoke.mjs
1. useGame: `listSaves(): Promise<SaveSlotMeta[]>`, `saveToSlot(id: ManualSlotId)`, `loadSlot(id: string): Promise<boolean>`, `deleteSlot(id: ManualSlotId)`. 기존 `save()`·`load()` 는 자동 저장 칸 그대로(호환). 자동 저장: 진행으로 4주마다(게임 주 기준) + 연말 정산 제출 뒤 + 기존 목장·승부복 시점.
2. 설정 모달 '저장 관리': 자동 저장 1줄 + 수동 3칸 표(칸 이름·게임 날짜·마주 이름·저장 시각·크기 KB/MB). 수동 칸: [저장](채워져 있으면 덮어쓰기 확인), [불러오기], [삭제](확인). 자동 칸: [불러오기]. 빈 칸은 '비어 있음'. 결과·오류는 토스트(useNotify), SaveStoreError 는 그 한국어 문구.
3. 스모크: 수동 칸 1 저장 → 진행 → 칸 1 불러오기로 날짜 복원 확인을 추가.

## S4 파일 내보내기·가져오기 (S3 뒤)
허용: src/ui/storage/fileTransfer.ts, src/ui/shell/SettingsModal.tsx(저장 관리 아래 파일 줄), src/ui/game/useGame.ts(가져오기 API), tests/ui/fileTransfer.test.ts(신규), tests/ui/shellSettings.test.ts
1. 내보내기: 압축 `.ssg`(gzip JSON, 기본)와 일반 `.json` 둘 다. 파일 이름은 suggestSaveFileName 확장자만 바꿔서.
2. 가져오기: 파일 앞 바이트로 gzip/JSON 판별 → deserializeGame. 오류 한국어: 형식이 아님 / 지원하지 않는 버전(schemaVersion) / 마이그레이션 실패 / 검증 오류(첫 3개 항목). 성공하면 지금 게임을 대체하기 전에 확인.

## 수용 기준
1. 30년 저장본 압축 크기 측정 보고(목표 원본 25% 이하).
2. 위 테스트 통과, 옛 저장본(비압축 JSON 레코드·JSON 파일) 불러오기 회귀 없음.
3. 브라우저 스모크에 슬롯 저장·불러오기 추가, PASS.
4. `npm test && npm run typecheck && npm run lint && npm run build` 통과.
