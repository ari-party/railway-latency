import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'eslint/config';
import nextPluginModule from '@next/eslint-plugin-next';
import tsEslintPlugin from '@typescript-eslint/eslint-plugin';
import { FlatCompat } from '@eslint/eslintrc';
import prettier from 'eslint-config-prettier/flat';
import importPlugin from 'eslint-plugin-import';
import sortDestructureKeysPlugin from 'eslint-plugin-sort-destructure-keys';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  resolvePluginsRelativeTo: __dirname,
});

const nextCoreWebVitals = nextPluginModule.configs['core-web-vitals'];
const tsRecommended = tsEslintPlugin.configs['flat/recommended'].map(
  (config) => ({
    ...config,
    files: config.files ?? ['**/*.{ts,tsx,mts,cts}'],
  }),
);
const reactAccessibilityConfigs = compat
  .extends(
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:jsx-a11y/recommended',
  )
  .map((config) => ({
    ...config,
    files: config.files ?? ['**/*.{js,jsx,ts,tsx,mts,cts}'],
  }));

export default defineConfig([
  nextCoreWebVitals,
  ...reactAccessibilityConfigs,
  ...tsRecommended,
  prettier,
  {
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
  {
    ignores: [
      '**/.next/**',
      '**/node_modules/**',
      'generated/**',
      'public/**',
      'coverage/**',
      'dist/**',
      'eslint.config.mjs',
      'next-env.d.ts',
    ],
  },
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json'],
        tsconfigRootDir: __dirname,
      },
    },
    settings: {
      'import/resolver': {
        typescript: {
          project: ['./tsconfig.json'],
        },
      },
    },
  },
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          disallowTypeAnnotations: false,
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/triple-slash-reference': 'off',
    },
  },
  {
    files: ['**/*.{js,jsx,ts,tsx,mts,cts}'],
    plugins: {
      import: importPlugin,
      'sort-destructure-keys': sortDestructureKeysPlugin,
    },
    rules: {
      'import/consistent-type-specifier-style': ['error', 'prefer-top-level'],
      'import/order': [
        'error',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            ['parent', 'sibling', 'index'],
            'object',
            'type',
          ],
          pathGroupsExcludedImportTypes: ['builtin'],
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
          'newlines-between': 'always',
        },
      ],
      'sort-destructure-keys/sort-destructure-keys': 'error',
      'react-hooks/incompatible-library': 'off',
    },
  },
]);
