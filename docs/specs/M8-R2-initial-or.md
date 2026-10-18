# M8-R2 초기 OR 과 실제 능력 맞추기 (측정 → 보정)

공통: AGENTS.md / docs/specs/M7-common.md. 근거: 플레이 테스트 1·2회차 — 지급 현역마(3세, 미출주)가 OR 103 '그룹급'인데 종합 B, 첫 출주 아침 오즈 Evs ↔ 실제 SP 14/1.
초기 OR = src/engine/world/rating.ts initialOfficialRating(horse) = ratingFromAbility(meanAbility(horse.ability)).

## 1단계 측정 (코드 변경 없음, 측정 테스트만 — tests/verify/initialOr.test.ts 신규, 환경 변수 INIT_OR_OUT 있을 때만 실행)
- 시드 3개(20261011, 7, 424242)로 새 게임을 만들고 1시즌 진행. 초기 OR 이 있던 말(지급 현역마 + 세계 3세 이상 현역) 각각:
  초기 OR, 시즌 첫 3전 성적 지수 평균 + 그 경주 기준 레벨(=실제 경기력 환산 OR), 시즌 말 OR, 플레이어용 종합 등급.
- 출력: 초기 OR − 실제 환산 OR 의 분포(평균·중앙값·분위수), 능력 구간별 편차, 지급 현역마만 따로. 원인 후보(ratingFromAbility 기울기·절편, 적성 미반영 등)를 코드 근거와 함께.
## 2단계 보정 (1단계 보고를 Opus 가 승인한 뒤)
- 허용: src/engine/world/rating.ts, src/engine/config/rating.ts(새 상수), 관련 테스트. 초기 OR 편차 평균 ±3 이내 목표. 고정 해시 변경은 보고(갱신은 Opus).
