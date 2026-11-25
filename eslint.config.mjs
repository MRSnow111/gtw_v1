// ESLint (волна 3): Next 16 flat config. Скрипт: npm run lint -> "eslint src app".
// Цель — 0 errors; warnings допустимы. Правила, дающие массовые ложные срабатывания,
// ослаблены ниже вместо переписывания кода.
import coreWebVitals from 'eslint-config-next/core-web-vitals';
import ts from 'eslint-config-next/typescript';

export default [
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', 'out/**'],
  },
  ...coreWebVitals,
  ...ts,
  {
    rules: {
      // Массовые предупреждения стиля, не влияющие на поведение:
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^[A-Z_]' },
      ],
      'react-hooks/exhaustive-deps': 'warn',
      // eslint-plugin-react-hooks v7 (Next 16): легаси-паттерн setState-в-effect встречается
      // в существующем коде повсеместно; переписывать эффект-логику в волне чистки нельзя
      // (риск изменения поведения) -> warning вместо error.
      'react-hooks/set-state-in-effect': 'warn',
      '@next/next/no-img-element': 'warn',
    },
  },
];
