import { readFileSync } from 'node:fs';
import resolve from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const dev = process.env.ROLLUP_WATCH === 'true';

export default {
  input: 'src/glowcard.ts',
  output: {
    file: 'dist/glowcard.js',
    format: 'es',
    sourcemap: dev,
    inlineDynamicImports: true,
  },
  plugins: [
    replace({
      preventAssignment: true,
      values: { __GLOWCARD_VERSION__: JSON.stringify(pkg.version) },
    }),
    resolve(),
    typescript({ include: ['src/**/*.ts'] }),
    !dev && terser({ format: { comments: false } }),
  ],
};
