import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const qualityRules = {
  'no-console': ['warn', { allow: ['warn', 'error'] }],
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-new-func': 'error',
  'no-shadow': 'off',
  'no-redeclare': 'off',
  'no-var': 'error',
  eqeqeq: ['error', 'always', { null: 'ignore' }],
  'prefer-const': 'error',
  'max-depth': ['error', 4],
  complexity: ['error', 20],
  'max-lines-per-function': [
    'error',
    {
      max: 100,
      skipBlankLines: true,
      skipComments: true,
    },
  ],
};

export default [
  {
    ignores: ['node_modules/**', 'dist/**', 'coverage/**', 'docs/generated/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'vite.config.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: globals.browser,
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      ...qualityRules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-shadow': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'inline-type-imports',
        },
      ],
    },
  },
  {
    files: ['scripts/**/*.cjs', 'tests/**/*.cjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: globals.node,
    },
    rules: {
      ...qualityRules,
      'no-shadow': 'error',
      'no-redeclare': 'error',
      'no-console': 'off',
    },
  },
];
