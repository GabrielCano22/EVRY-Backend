import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts', 'test/**/*.ts', 'scripts/**/*.ts'],
  },
  {
    files: ['src/modules/adaptive/adaptive.service.ts'],
    rules: {
      'prefer-const': 'off',
    },
  },
  {
    files: ['src/modules/cycle/cycle.service.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  {
    files: [
      'src/modules/cycle/cycle.service.spec.ts',
      'src/modules/exercises/exercises.service.spec.ts',
      'src/modules/workouts/workouts.service.spec.ts',
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
