# M2-10c 목장·배합 화면

담당: haiku-coder · 선행: M2-10b

## 목적
플레이어가 (1) 내 말의 단서(마체 평가 등급·코멘트·거리/성장 힌트)를 보고, (2) 종마를 골라 배합 미리보기(닉스·인브리드·힌트)를 확인하고, (3) 교배를 예약하고, (4) 시간을 진행해 망아지 출생을 확인한다. **능력치 숫자는 어디에도 표시하지 않는다.**

## 생성·수정할 파일
1. `src/ui/breeding/HorseCard.tsx` — 말 1두 카드: 이름, 성별·나이·상태, 부×모(모부), 계통, 마체 평가 6항목 등급(색 배지), 코멘트 1~3줄, 거리 힌트, 성장형 힌트
2. `src/ui/breeding/PedigreeView.tsx` — 5대 혈통표(부측 위·모측 아래, 대별 열), 인브리드 대상 조상은 강조색, 미상은 "—"
3. `src/ui/breeding/BreedingScreen.tsx` — 좌: 내 말 목록(HorseCard), 우: 종마 목록(이름·계류국·종부료·계통, 검색창) → 암말·종마 선택 시 MatingPreview 패널(닉스 라벨, 인브리드 목록 "Northern Dancer 4×3 (18.75%)", 거리·조숙 힌트, 코멘트, 종부료, '교배 예약' 버튼, 오류 메시지 한국어) + PedigreeView(가상 교배)
   상단 바: 날짜(formatDateKo), 자금, 버튼 [1주 진행] [4주 진행] [종부 시즌까지] [출산 시즌까지] [저장] [불러오기] [새 게임], 최근 이벤트 10줄(eventKo)
4. `src/ui/App.tsx` — 탭 2개: '목장·배합'(기본), '레이스 데모'
5. `src/ui/app.css` — 카드·배지·표·탭 스타일(어두운 테마 유지)

## 규칙
- 상태는 useGame 훅으로만 바꾼다. 엔진 함수 직접 호출은 조회용(assessForPlayer, buildMatingPreview, buildMatingPedigree, findInbreeding)만.
- 문구는 한국어, 실명은 종마 이름·국가명만.
- 새 게임이 없으면 "새 게임 시작" 패널(마주 이름 입력, 시드 입력)만 보인다.

## 수용 기준
1. `npm run build` 성공, typecheck·lint 통과.
2. `npm run dev` 화면에서: 새 게임 → 암말 3두 카드에 등급·코멘트가 보이고 숫자 능력치가 없다 → 종마 선택 시 미리보기 표시 → 종부 시즌까지 진행 → 예약 성공 → 출산 시즌까지 진행(약 1년) → 망아지 카드 표시. (보고서에 dev 서버 기동만 확인하면 된다. Opus 가 브라우저로 확인한다)

## 테스트 명령
`npm test && npm run typecheck && npm run lint && npm run build`
