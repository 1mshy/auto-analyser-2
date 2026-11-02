import { describe, expect, it } from 'vitest';
import { system } from './system';

describe('shared semantic theme', () => {
  it('overrides built-in Chakra colours through nested token paths', () => {
    expect(system.token.var('colors.bg.muted')).toBe(
      'var(--chakra-colors-bg-muted)',
    );
    expect(system.token.var('colors.fg.muted')).toBe(
      'var(--chakra-colors-fg-muted)',
    );
    expect(system.token.var('colors.chart.grid')).toBe(
      'var(--chakra-colors-chart-grid)',
    );
    const styles = JSON.stringify(system.getTokenCss());
    expect(styles).toContain('var(--color-paper-3)');
    expect(styles).toContain('var(--color-rule)');
    expect(styles).not.toContain('bg\\\\.muted');
  });
});
