// eslint-disable-next-line @typescript-eslint/no-require-imports, import/no-extraneous-dependencies
const base = require('@railway-latency/eslint-config')(__dirname);

module.exports = {
  ...base,
  overrides: [
    ...(base.overrides ?? []),
    {
      // vitest puts vi.mock() calls before the imports they hoist over, and pulls
      // test helpers in by relative path rather than the @/ alias.
      files: ['test/**/*.ts'],
      rules: {
        'import/first': 'off',
        'import/order': 'off',
        'no-restricted-imports': 'off',
        'no-underscore-dangle': ['error', { allow: ['_meta'] }],
      },
    },
  ],
};
