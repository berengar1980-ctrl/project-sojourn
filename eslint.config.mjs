import js from '@eslint/js';
import globals from 'globals';

const qualityRules = {
  'no-console': ['warn', { allow: ['warn', 'error'] }],
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-new-func': 'error',
  'no-shadow': 'error',
  'no-redeclare': 'error',
  'no-var': 'error',
  eqeqeq: ['error', 'always', { null: 'ignore' }],
  'prefer-const': 'error',
  'max-depth': ['error', 4],
  complexity: ['error', 20],
  'max-lines-per-function': ['error', { max: 100, skipBlankLines: true, skipComments: true }]
};

export default [
  { ignores: ['node_modules/**', 'dist/**', 'coverage/**', 'docs/generated/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.browser },
    rules: qualityRules
  },
  {
    files: ['scripts/**/*.cjs', 'tests/**/*.cjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'commonjs', globals: globals.node },
    rules: { ...qualityRules, 'no-console': 'off' }
  }
];
