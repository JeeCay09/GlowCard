import { describe, expect, it } from 'vitest';
import { ensureFont } from '../src/core/font';

describe('ensureFont', () => {
  it('adds the embedded font once, without external requests', () => {
    ensureFont();
    ensureFont();
    const styles = document.querySelectorAll('#glowcard-font');
    expect(styles).toHaveLength(1);
    expect(styles[0].textContent).toContain('data:font/woff2;base64,');
    expect(styles[0].textContent).not.toContain('googleapis');
  });
});
