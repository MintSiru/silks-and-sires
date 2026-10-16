import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: true,
    // 병렬 작업(여러 에이전트) 중에도 무거운 시뮬레이션 테스트가 5초 기본 제한에 걸리지 않게(2026-10-16 Opus)
    testTimeout: 15_000,
  },
});
