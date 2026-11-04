import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'dev/build/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['*.js', '*.mjs', 'dev/*.mjs'],
    languageOptions: { globals: { process: 'readonly', URL: 'readonly', console: 'readonly' } },
  },
);
