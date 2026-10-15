# M4-P1 기수·조교사 능력 화면

담당: haiku-coder(엔진+뷰) · 선행: Opus 공용 타입(아래 '타입') · 근거: 사용자 결정(2026-10-15) — 능력은 S~E 등급, 실제 수치는 숨김, 대신 실제 성적 숫자(올해·통산 승수·승률·그룹 승)

## 타입 (Opus 가 먼저 넣는다 — 수정 금지)
- `PersonCareer { runners: number; wins: number; places: number; groupWins: number; g1Wins: number; earnings: Money }`(types/people.ts)
- `Jockey.career: PersonCareer`, `Trainer.career: PersonCareer`(통산, 올해 제외 — 올해는 seasonState.leading 에서 읽는다)
- 저장 마이그레이션: 기존 저장본은 0 으로 채운다.

## 규칙
1. **새 게임 초기 통산 성적**(people/generate.ts): 나이·능력에 맞는 그럴듯한 값. 난수 소비 없이 ID 해시로(trainerEyeFromId 와 같은 방식 — 기존 인물 해시 테스트가 바뀌지 않게 rng 를 쓰지 말 것):
   활동 연수 = 기수 max(0, 나이 − 18), 조교사 max(0, 나이 − 32). 연간 출주 = 기수 `CAREER_JOCKEY_RIDES_PER_YEAR`(300)·조교사 `CAREER_TRAINER_RUNNERS_PER_YEAR`(150) × (0.5 + skill/100). 승률 = `CAREER_WIN_RATE_BASE`(0.06) + skill/100 × `CAREER_WIN_RATE_SKILL`(0.14). 그룹 승 = 승수 × (skill/100)² × 0.05, G1 = 그룹 승 × 0.2, 입상 = 승수 × 2, 상금 = 승수 × €8,000 × (0.5 + skill/100). 해시로 ±15% 흔들고 정수로. 상수는 config/people.ts.
2. **연말 누적**: 새 시즌 시작 처리(season/system.ts 의 startNewSeason, 지난 해 리딩 집계가 아직 있을 때)에서 지난 해 유럽 합산 leading 의 jockey·trainer 항목을 각자 career 에 더한다(runners·wins·places·groupWins·earnings). g1Wins 는 그 해 결과 기록에서 G1 우승을 세어 더한다(결과 보존 정책상 그룹 레이스 결과는 남아 있음 — raceResults 에서 G1·그 해·1착의 jockeyId/trainer 를 센다. 조교사는 그 말의 당시 trainerId 를 결과에서 못 얻으면 declarations 기록이 없으므로 기수만 정확히, 조교사 G1 은 leading 의 groupWins 비율로 추정하지 말고 0 증가로 두고 주석).
3. **화면 뷰**(ui/staff/staffView.ts 에 추가, 엔진 수정 없이):
   - `jockeyProfile(state, jockeyId)`: 이름·나라·나이·견습 여부·최저 기승 체중(설정 단위 lb/kg 은 화면에서) + 등급 { 출발: start, 페이스: pace, 마무리: finish, 힘: strength, 종합: skill } → gradeOf(assessment.ts) S~E + 잘 맞는 작전(preferredStyle 한국어) + 올해(leading)·통산(career)·합계 성적 { 출주, 승, 승률 %, 입상률 %, 그룹 승, G1 승, 상금 } + 관계·전속 상태.
   - `trainerProfile(state, trainerId)`: 이름·나라·나이·야드·지역·수용 두수·내 말 위탁 수 + 등급 { 조교: skill, 상마안: eye, 시설: facilityGrade(1→E … 5→S 대응표) } + 성향(style 한국어, 장거리·단거리 성향 staminaBias 문구, 2세 조기 출주 juvenileFocus 문구) + 성적(기수와 같은 형식) + 관계·전속.
   - **원래 수치(0~100)는 결과에 넣지 않는다**(테스트로 확인).
4. **화면**(ui/staff/StaffScreen.tsx): 인맥 탭 표의 이름을 누르면 오른쪽(좁은 화면은 아래)에 프로필 카드. '아는 사람만' 을 끄면 전체 목록에서 고를 수 있다. 등급 색은 기존 gradeColor.

## 생성·수정할 파일
- src/engine/config/people.ts, src/engine/people/generate.ts, src/engine/season/system.ts
- src/ui/staff/staffView.ts, src/ui/staff/StaffScreen.tsx
- tests/engine/personCareer.test.ts, tests/ui/staffView.test.ts(추가)

## 수용 기준
1. 새 게임 인물 해시 테스트(arabOwners 등) 불변 — 초기 통산 성적은 rng 미사용.
2. 52주 진행 후 새해 첫 주에 career 가 지난 해 leading 만큼 늘어난다(기수·조교사 각 1명 검사).
3. 프로필 결과 JSON 에 원 능력 수치 키(skill·eye·start·pace·finish·strength·staminaBias·juvenileFocus 숫자)가 없다.
4. `npm test && npm run typecheck && npm run lint && npm run build` 통과, Opus 브라우저 확인.

## 금지
src/engine/types 수정 금지(Opus 가 넣은 것만 사용). 새 의존성 금지. git commit 금지.
