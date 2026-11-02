import { expect, it } from 'vitest';
import {
  normalizeResearchSymbol,
  researchInputError,
  researchSymbols,
} from './model';

it('matches backend normalization and deduplicates share classes without losing Canadian suffixes', () => {
  expect(researchSymbols(' brk.b, BRK/B  shop.to, SHOP.TO, ABC.V ')).toEqual([
    'BRK-B',
    'SHOP.TO',
    'ABC.V',
  ]);
  expect(normalizeResearchSymbol('ABC.NE')).toBe('ABC.NE');
  expect(normalizeResearchSymbol('ABC.CN')).toBe('ABC.CN');
});

it('enforces the request bounds before generation', () => {
  expect(
    researchInputError({ symbols: ['AAPL'], question: 'x'.repeat(1001) }),
  ).toMatch(/1,000/);
  expect(
    researchInputError({ symbols: ['A'.repeat(21)], question: 'Explain' }),
  ).toMatch(/valid stock/);
  expect(
    researchInputError({ symbols: ['BRK-B', 'SHOP.TO'], question: 'Compare' }),
  ).toBeUndefined();
});
