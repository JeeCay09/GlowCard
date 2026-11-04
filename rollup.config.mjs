import { readFileSync } from 'node:fs';
import resolve from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import inlineFont from './inline-font.mjs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const watch = process.env.ROLLUP_WATCH === 'true';
const withDemo = Boolean(process.env.GLOWCARD_DEV);

const plugins = () => [
  replace({
    preventAssignment: true,
    values: { __GLOWCARD_VERSION__: JSON.stringify(pkg.version) },
  }),
  inlineFont(),
  resolve(),
  typescript({ include: ['src/**/*.ts', 'dev/**/*.ts'], noEmitOnError: !watch }),
  !watch && terser({ format: { comments: false } }),
];

const main = {
  input: 'src/glowcard.ts',
  output: { file: 'dist/glowcard.js', format: 'es', sourcemap: watch, inlineDynamicImports: true },
  plugins: plugins(),
};

// Preview page helpers (dev/index.html), only built by `npm run dev`.
const demo = {
  input: 'dev/demo.ts',
  output: { file: 'dev/build/demo.js', format: 'es', sourcemap: true },
  plugins: plugins(),
};

export default withDemo ? [main, demo] : main;
