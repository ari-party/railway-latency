// eslint-disable-next-line @typescript-eslint/no-require-imports, import/no-extraneous-dependencies
const base = require('@railway-latency/eslint-config')(__dirname);

module.exports = {
  ...base,
  rules: {
    ...base.rules,
    'no-restricted-imports': 'off',
  },
};
