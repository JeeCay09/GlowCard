import { defineConfig } from 'vitest/config';
import inlineFont from './inline-font.mjs';

export default defineConfig({
  plugins: [inlineFont()],
  define: { __GLOWCARD_VERSION__: JSON.stringify('0.0.0-test') },
  test: { environment: 'happy-dom' },
});
