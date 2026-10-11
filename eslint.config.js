import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist', 'node_modules', 'coverage'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/ui/**/*.{ts,tsx}', 'src/main.tsx'],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ['tests/**/*.{ts,tsx}', '**/*.config.*'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['src/engine/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: '엔진은 시드 RNG/주입된 시간만 사용',
        },
        {
          object: 'Date',
          property: 'now',
          message: '엔진은 시드 RNG/주입된 시간만 사용',
        },
      ],
      'no-restricted-globals': [
        'error',
        {
          name: 'window',
          message: '엔진은 DOM에 접근하지 않는다',
        },
        {
          name: 'document',
          message: '엔진은 DOM에 접근하지 않는다',
        },
        {
          name: 'localStorage',
          message: '엔진은 저장소에 직접 접근하지 않는다',
        },
        {
          name: 'indexedDB',
          message: '엔진은 저장소에 직접 접근하지 않는다',
        },
        {
          name: 'performance',
          message: '엔진은 시드 RNG/주입된 시간만 사용',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message: '엔진은 시드 RNG/주입된 시간만 사용',
        },
      ],
    },
  },
);
