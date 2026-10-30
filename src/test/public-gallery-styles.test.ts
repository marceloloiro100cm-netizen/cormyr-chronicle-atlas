import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('public noble gallery stylesheet', () => {
  it('exposes gallery rules at the top level and preserves complete images', () => {
    const style = document.createElement('style');
    style.textContent = readFileSync(resolve('public/cormyr/style.css'), 'utf8');
    document.head.append(style);
    try {
      expect(style.sheet).not.toBeNull();
      const rules = Array.from(style.sheet!.cssRules) as CSSStyleRule[];
      const rule = (selector: string) => {
        const matches = rules.filter(r => r.selectorText?.split(',').map(s => s.trim()).includes(selector));
        expect(matches, selector).toHaveLength(1);
        return matches[0]!.style;
      };
      expect(rule('.castle-art-gallery-grid').getPropertyValue('display')).toBe('grid');
      expect(rule('.castle-art-gallery-grid').getPropertyValue('grid-template-columns')).toContain('min(100%, 240px)');
      expect(rule('.castle-gallery-frame').getPropertyValue('position')).toBe('relative');
      expect(rule('.castle-gallery-canvas img').getPropertyValue('object-fit')).toBe('contain');
      expect(rule('.castle-gallery-canvas > a').getPropertyValue('height')).toBe('100%');
      expect(rule('.castle-gallery-plaque').getPropertyValue('display')).toBe('inline-flex');
    } finally {
      style.remove();
    }
  });
});
