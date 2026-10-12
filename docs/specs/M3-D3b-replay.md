# M3-D3b 시즌 다시보기 (실황·OR 변동 포함)

담당: haiku-coder · 선행: M3-D3a 승인(0b90681), M3-D2a·D2b 승인

## 목적
시즌 탭에서 플레이어 말이 나온 레이스와 G1 을 다시 볼 수 있게 한다. 저장된 입력(ReplayableRace)으로 runRace 를 다시 돌려 레이스 띠·실황 자막·한 줄 평·결과판(OR 변동 포함)을 보여 준다.

## 사용할 것 (수정 금지)
- `SeasonState.replayable: ReplayableRace[]`(meetingId, race, going, date, seed, field), `ratingHistory`(RatingChange: date, raceId, from, to)
- `runRace`(race/runRace.ts), `getRacecourse`(data/staticData.ts 의 경마장 조회), `RaceViewer`(props: replay, result, path, info, commentary, verdicts), `ViewerInfo.ratingChanges`, `extractCommentaryEvents`·`renderCommentary`·`horseVerdicts`·`getCommentaryLines`
- 저장된 결과와 다시 돌린 결과의 착순·finishTime 이 같아야 한다(A6b 에서 보장).

## 생성·수정할 파일
1. `src/ui/season/replayView.ts` (신규, 순수 함수)
   - `replayList(state): { key: string; title: string; dateLabel: string; grade; hasPlayer: boolean }[]` — 최신순
   - `buildReplay(state, key): { output: RunRaceOutput; info: ViewerInfo; commentary; verdicts } ` — runRace 재실행(recordReplay true), ViewerInfo 의 마명은 field 의 이름, `ratingChanges` 는 ratingHistory 에서 그 raceId 의 변동(runner index 기준)
   - 다시 돌린 결과가 raceResults 의 저장 결과와 착순이 다르면 Error(재현성 깨짐 감지)
2. `src/ui/season/ReplayPanel.tsx` (신규) — 목록에서 고르면 RaceViewer 표시.
3. `src/ui/season/SeasonScreen.tsx` — '최근 결과' 표의 각 행 또는 아래에 '다시보기' 영역(ReplayPanel) 연결. 최소 변경.
4. `tests/ui/replayView.test.ts` (신규)

## 수용 기준
1. bootstrapGame 후 플레이어 말을 출주시켜 결과까지 진행한 상태에서 replayList 에 그 레이스가 hasPlayer true 로 있다(D3a2 지급 말 사용, 4월까지 advance).
2. buildReplay 결과의 착순·finishTime 이 raceResults 의 저장 결과와 같다.
3. ratingChanges 가 그 레이스로 바뀐 OR 과 일치(첫 OR 이면 from null).
4. 자막·한 줄 평이 비어 있지 않다.
5. `npm test && npm run typecheck && npm run lint && npm run build` 통과. 브라우저 확인은 Opus.

## 금지
src/engine 수정 금지. App.tsx 수정 금지(D3c 담당). 레이스 띠 렌더러 수정 금지. git commit 금지.
