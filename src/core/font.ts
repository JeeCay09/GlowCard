import fontUrl from '../assets/plus-jakarta-sans-latin-wght-normal.woff2';

const STYLE_ID = 'glowcard-font';

/**
 * Adds the embedded Plus Jakarta Sans to the page once. @font-face only works in the
 * document, not inside shadow roots. No request leaves Home Assistant.
 */
export function ensureFont(doc: Document = document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `@font-face{font-family:'Plus Jakarta Sans Variable';font-style:normal;font-display:swap;font-weight:200 800;src:url(${fontUrl}) format('woff2-variations'),url(${fontUrl}) format('woff2');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;}`;
  doc.head.appendChild(style);
}
