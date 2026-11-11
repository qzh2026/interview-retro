import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import eslintConfigPrettier from 'eslint-config-prettier'

/**
 * ESLint 9 扁平配置：js/TS/Vue recommended + Prettier 收尾。
 * Prettier 只管格式化（eslint-config-prettier 关掉格式类规则），lint 只管正确性。
 */
export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'server/data/**', '.workbuddy/**', 'coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser },
    },
  },
  {
    rules: {
      // App.vue 单词名是入口惯例；其余组件均已多词命名
      'vue/multi-word-component-names': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  eslintConfigPrettier,
)
