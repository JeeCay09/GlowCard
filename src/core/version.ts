export const VERSION: string = __GLOWCARD_VERSION__;

/** Prints the loaded GlowCard version once in the browser console. */
export function logVersion(): void {
  console.info(
    `%c GLOWCARD %c v${VERSION} `,
    'color:#07080B;background:#FBBF24;font-weight:700;border-radius:4px 0 0 4px',
    'color:#FBBF24;background:#07080B;border-radius:0 4px 4px 0',
  );
}
