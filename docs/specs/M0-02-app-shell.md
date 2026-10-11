# M0-02 앱 셸 (index.html + React 진입점)

담당: haiku-coder · 선행: M0-01

## 목적
`npm run dev` 로 빈 React 화면이 뜨고, 스모크 테스트가 하나 도는 상태를 만든다.

## 생성할 파일
1. `index.html` — `<div id="root">`, `<script type="module" src="/src/main.tsx">`, `lang="ko"`, title `Silks & Sires`
2. `src/main.tsx` — `createRoot(document.getElementById('root')!)` 로 `<App />` 렌더 (StrictMode)
3. `src/ui/App.tsx` — 제목 "Silks & Sires" 와 한 줄 설명 "유럽 평지 경마 오너-브리더 시뮬레이션" 만 표시하는 함수 컴포넌트. `export default function App()`
4. `src/ui/app.css` — body 여백 0, 시스템 폰트, 어두운 배경(#14171c)·밝은 글자(#e8e8e8). main.tsx 에서 import
5. `tests/smoke.test.ts` — `import * as types from '../src/engine/types'` 후 `types.TURF_GOING_ORDER.length === 7`, `types.AW_GOING_ORDER.length === 3`, `types.SAVE_FORMAT === 'silks-and-sires-save'` 를 검증

## 수용 기준
1. `npm test` 에서 smoke 테스트 3개 단언이 통과한다.
2. `npm run typecheck`, `npm run lint`, `npm run build` 오류 0.
3. App.tsx 에 실제 경마장·레이스·인물 이름이 없다.

## 금지 사항
- 새 패키지 설치 금지. `src/engine/` 아래 파일 생성·수정 금지.

## 테스트 명령
`npm test && npm run typecheck && npm run lint && npm run build`
