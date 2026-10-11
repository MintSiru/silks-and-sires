# M3-A3c 프랑스 경마장 6곳 데이터

담당: haiku-data · 선행: M3-A3b 승인 · 근거: docs/race-calendar-plan.md 2-3 · 형식·규칙은 M3-A3a 명세와 같다.

## 경마장별 설계 목표
| id | 이름 | 모델 | 레이아웃 | 필수 특징 | 필요한 거리(m) |
|---|---|---|---|---|---|
| saint_ourens (**재설계**) | Saint-Ourens | ParisLongchamp | 우회전 대형(폭 34). 백스트레치 오르막 +10m → 정점 → 내리막 커브(−10m) → **가짜 직선**(직선 250m 뒤 짧은 커브) → 결승 직선 530m 평탄. 별도 직선 1,000m(스프린트) | false_straight, undulating, downhill_run, straight_course, galloping | 1,000(직선)·1,400·1,600·1,850·2,000·2,100·2,400·3,100·4,000 |
| vallenaire | Vallenaire | Chantilly | 우회전, 넓은 숲 코스, 결승 직선 600m, 완만한 오르막(+3m) | galloping, uphill_finish | 1,200·1,400·1,600·2,000·2,100·2,400 |
| port_aubray | Port-Aubray | Deauville | 직선 1,600m(폭 40) + 우회전 원형 | straight_course, galloping | 1,000·1,200·1,300·1,400·1,500·1,600(직선)·2,000·2,500(라운드) |
| clairval | Clairval | Saint-Cloud | 좌회전, 평탄, 결승 직선 550m | galloping | 1,400·1,600·2,000·2,100·2,400 |
| bellerive_le_bois | Bellerive-le-Bois | Maisons-Laffitte | 직선 2,000m(폭 40) + 좌회전 라운드 | straight_course, long_straight | 1,000·1,200·1,400·1,600·2,000(직선)·2,400(라운드) |
| montvigne | Montvigne | Lyon/Marseille | 좌회전 지방 코스, 평탄 | short_straight | 1,200·1,600·2,000·2,400 |

프랑스 거리는 미터 정수(프랑스식)로 둔다.

## 생성·수정할 파일
1. `data/racecourses.json` — 위 6곳(saint_ourens 는 기존 레코드를 재설계, id 유지)
2. `data/races.json` — 기존 프랑스 레이스 3개(Grand Prix de Saint-Ourens, Prix de Morvenne, Prix de Vallenaire)의 거리가 새 목록에 없으면 가장 가까운 유효 거리로
3. `data/_courses_review.md`, `tests/data/data.test.ts`, `tests/engine/runRace.test.ts` (경마장 수 19 → 24)

## 수용 기준
1. loadRacecourses 통과, 거리·features 충족.
2. 실명 grep 0건: `grep -iE "longchamp|chantilly|deauville|saint-cloud|maisons|laffitte|lyon|marseille|parislongchamp" data/racecourses.json data/races.json`
3. `npm test && npm run typecheck && npm run lint` 통과.

## 금지
src/ 수정 금지, git commit 금지.

## 추가 규칙 (A3a·A3b 검수 반영, 2026-10-11)
- A3b 의 모든 데이터 테스트 규칙을 프랑스 6곳에 적용: 형상 규칙(반경 2종·비직각 커브·엘보·스타디움 금지), 커브 시퀀스 상이, 닫힌 고리 둘레 1,800~3,300m, 열린 곡선 총길이 ≤ 4,200m, 실루엣 거리 d ≥ 0.010(전 경마장 대상), 폐합 0.5m. 테스트 대상 국가에 FR 추가.
- Saint-Ourens 는 지금 대칭 스타디움이라 반드시 재설계(가짜 직선·언덕 표현, 결승 직선 530m).
- 실루엣 모델: Vallenaire = 넓은 둥근 삼각형, Port-Aubray = 직선 + 작은 원형(원형은 둘레 1,800~2,300m), Clairval = 길쭉한 사다리꼴, Bellerive-le-Bois = 직선 + 좌회전 큰 고리, Montvigne = 작은 불규칙 고리.
- **함께 고칠 것:** Kilcarrow Heath 결승 직선 ≥ 800m(모델 특징: 긴 결승 직선). 열린 말굽 유지, 총길이 ≤ 4,200m, 기존 필수 거리 유지.
