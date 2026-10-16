const spfxProfile = require('@microsoft/eslint-config-spfx/lib/flat-profiles/react');

module.exports = [
  ...spfxProfile,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: __dirname,
        project: './tsconfig.json'
      }
    }
  },
  {
    files: ['src/webparts/helpdeskSystem/**/*.tsx'],
    // React ref locks intentionally change across awaits; variable race checks remain enabled.
    rules: { 'require-atomic-updates': ['error', { allowProperties: true }] }
  }
];
