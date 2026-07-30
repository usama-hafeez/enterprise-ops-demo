import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.angular/**',
      'packages/web/public/**',
      'packages/web/tools/**',
      '**/*.js',
      '**/*.mjs',
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      // The DbExecutor interface deliberately returns untyped rows; call
      // sites cast at the boundary.
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
