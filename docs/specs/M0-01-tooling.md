# M0-01 프로젝트 도구 설정 (Vite + React + TypeScript + Vitest + ESLint)

담당: haiku-coder

## 목적
`npm test`, `npm run typecheck`, `npm run lint`, `npm run dev`, `npm run build` 가 동작하는 빈 골격을 만든다.

## 생성할 파일 (이 목록 외 수정 금지. package-lock.json 은 npm 이 생성)
1. `package.json`
2. `tsconfig.json`
3. `vite.config.ts` (Vitest 설정 포함)
4. `eslint.config.js`
5. `.gitignore`

## 요구 사항
- `package.json`
  - `"name": "silks-and-sires"`, `"private": true`, `"type": "module"`.
  - scripts: `dev`=`vite`, `build`=`tsc --noEmit && vite build`, `preview`=`vite preview`, `test`=`vitest run`, `test:watch`=`vitest`, `typecheck`=`tsc --noEmit`, `lint`=`eslint .`
  - dependencies: `react`, `react-dom` (최신 19.x)
  - devDependencies: `typescript`(~6.0), `vite`(^8), `@vitejs/plugin-react`(^6), `vitest`(^5), `eslint`, `@eslint/js`, `typescript-eslint`, `globals`, `@types/react`, `@types/react-dom`, `@types/node`, `fake-indexeddb`.
  - 위 목록 외 패키지 설치 금지. peer 충돌이 나면 버전을 낮춰 해결하고 보고서에 적는다.
- `tsconfig.json`
  - `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`, `noFallthroughCasesInSwitch: true`
  - `target: ES2022`, `module: ESNext`, `moduleResolution: Bundler`, `lib: ["ES2022", "DOM", "DOM.Iterable"]`, `jsx: react-jsx`
  - `resolveJsonModule: true`, `isolatedModules: true`, `skipLibCheck: true`, `noEmit: true`, `types: ["node"]`
  - `include: ["src", "tests", "data", "vite.config.ts"]`
- `vite.config.ts`: `@vitejs/plugin-react` 사용. `test: { include: ['tests/**/*.test.ts'], environment: 'node' }`. (`/// <reference types="vitest/config" />` 또는 `defineConfig` from `vitest/config` 사용)
- `eslint.config.js` (flat config):
  - `@eslint/js` recommended + `typescript-eslint` recommended.
  - 무시: `dist`, `node_modules`, `coverage`.
  - 브라우저 globals 는 `src/ui/**`, `src/main.tsx` 에만. node globals 는 `tests/**`, `*.config.*` 에.
  - **`src/engine/**` 전용 규칙(중요):**
    - `no-restricted-properties`: `Math.random`, `Date.now` 금지 (message: "엔진은 시드 RNG/주입된 시간만 사용")
    - `no-restricted-globals`: `window`, `document`, `localStorage`, `indexedDB`, `performance` 금지
    - `no-restricted-syntax`: `NewExpression[callee.name='Date']` 금지
  - `@typescript-eslint/no-unused-vars`: error, `argsIgnorePattern: '^_'`.
- `.gitignore`: `node_modules`, `dist`, `coverage`, `*.log`, `.DS_Store`.

## 수용 기준
1. `npm install` 이 경고 외 오류 없이 끝난다.
2. `npm run typecheck` 가 기존 `src/engine/types/*.ts` 를 포함해 오류 0으로 통과한다.
3. `npm run lint` 가 오류 0으로 통과한다.
4. 임시 파일 `src/engine/_lintprobe.ts` 에 `export const x = Math.random();` 을 넣으면 `npm run lint` 가 실패함을 확인하고, **확인 후 그 파일을 삭제한다.**
5. `npm test` 는 테스트 파일이 없어도 실패하지 않도록 vitest 옵션 `passWithNoTests: true` 를 설정한다.

## 금지 사항
- `src/engine/types/` 수정 금지.
- 목록 외 파일 생성 금지(lock 파일 제외). React 컴포넌트·index.html 은 다음 티켓(M0-02).

## 테스트 명령
`npm install && npm run typecheck && npm run lint && npm test`
