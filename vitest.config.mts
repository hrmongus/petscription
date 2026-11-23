import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@lib': `${import.meta.dirname}/lib`, '@admin': `${import.meta.dirname}/admin`, '@': import.meta.dirname } },
  test: { include: ['lib/**/*.test.ts', 'scripts/**/*.test.ts', 'admin/**/*.test.ts'] },
});
