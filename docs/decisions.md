# 결정 기록 (Decisions Log)

형식: `날짜 | 구분 | 내용`. 구분 = 사용자(게임 디자인) / 기술(Opus) / 승인 / 반려.

## 사용자 결정
- 2026-10-11 | 사용자 | 가상 경마장 4곳 = 잔디 3 + 올웨더 1.
- 2026-10-11 | 사용자 | 레이스 변동성 = 현실형. 인기 1위 승률 목표 약 30% (허용 25~35%).
- 2026-10-11 | 사용자 | 시작 연도 하나로 고정 (START_YEAR = 2026). 시나리오 선택 없음.

## 기술 결정 (Opus)
- 2026-10-11 | 기술 | 내부 단위: 거리 m, 시간 s, 부담중량 lb 정수, 돈 유로 정수, 능력치 0~100. 표시는 펄롱·stone-lb 병기.
- 2026-10-11 | 기술 | 잔디 마장 7단계 = firm, good_to_firm, good, good_to_soft, soft, soft_to_heavy, heavy (기획서 "Firm ~ Heavy" 문구를 따름). AW 는 별도 3단계 standard_to_fast / standard / standard_to_slow.
- 2026-10-11 | 기술 | RNG = sfc32 + 문자열/숫자 시드 해시(cyrb128). fork(label) 은 부모에서 next() 1회 소비. normal() 은 여분 캐시 없음(상태 직렬화 단순화).
- 2026-10-11 | 기술 | 레이스 시드 하나에서 fork('draw'/'odds'/'sim') 로 독립 스트림. 오즈 로직 변경이 결과를 바꾸지 않게 한다.
- 2026-10-11 | 기술 | 모든 말(실명 종마·과거 혈통 포함)은 Horse 레코드 하나. Stallion/Mare 는 horseId 로 붙는 확장 레코드. 실명 종마는 realKey 로 이름 표와 분리.
- 2026-10-11 | 기술 | GameState 는 순수 JSON 데이터. advanceWeek 는 structuredClone 한 draft 를 WeeklySystem 들이 고정 순서로 수정.
- 2026-10-11 | 기술 | 엔진 금지 API(Math.random, Date.now, window, document)는 ESLint no-restricted-* 규칙으로 자동 검출.
- 2026-10-11 | 기술 | 트랙 레이아웃은 구간(직선/곡선+고도차) 목록, 마지막 구간 끝 = 결승선. 미니맵 좌표는 구간에서 계산(별도 저장 안 함).
- 2026-10-11 | 기술 | 저장소: IndexedDB(브라우저) + JSON 파일 내보내기. 테스트용 devDependency fake-indexeddb 허용.
- 2026-10-11 | 기술 | config 는 배럴 파일 없이 src/engine/config/<주제>.ts 를 직접 import.

## 티켓 판정
- 2026-10-11 | 승인 | M0-01 도구 설정 — typecheck/lint/test 통과, 엔진 금지 API 린트 동작 확인.
- 2026-10-11 | 승인 | M0-02 앱 셸 — build/test 통과. main.tsx 의 vite/client 참조 허용.
- 2026-10-11 | 승인(Opus 보정) | M0-03 RNG — 24개 테스트 통과. cyrb128 마무리 단계가 표준과 달라(이전 h1 로 XOR) Opus 가 1줄 수정, 시드 의존 코드가 생기기 전에 확정.
- 2026-10-11 | 승인(Opus 보정) | M0-05 저장 — 31개 테스트 통과. 파일명에 한글 등 유니코드 문자 허용하도록 정규식 1줄 수정.
- 2026-10-11 | 승인 | M0-04 시간 진행 — 21개 테스트 통과(52주 순환, 단계 이벤트, 불변성, 104주 재현). M0 완료.
- 2026-10-11 | 승인 | M1-01 마장 — 17개 테스트 통과. 명세의 "Record 6개"는 Opus 오기(실제 5개).
- 2026-10-11 | 승인 | M1-03 코스 경로 — 20개 테스트 통과. isHomeStraight 경계는 `toFinish < homeStraightLength`(직선 시작점은 직선 밖)로 확정.
- 2026-10-11 | 승인 | M1-06 결과 — 16개 테스트 통과. 명세 예시 0.9→¾ 는 Opus 오기, 최근접 ¼ 반올림(0.9→1) 유지. 타입 주석(sectionalMarks ≥ 50m) 정정.
