import { readFileSync } from 'node:fs';

/** Rollup/Vite plugin: `import url from './x.woff2'` gives a base64 data URL. */
export default function inlineFont() {
  return {
    name: 'glowcard-inline-font',
    enforce: 'pre',
    load(id) {
      if (!id.endsWith('.woff2')) return null;
      const base64 = readFileSync(id).toString('base64');
      return `export default ${JSON.stringify(`data:font/woff2;base64,${base64}`)};`;
    },
  };
}
