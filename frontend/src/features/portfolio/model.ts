import { extractObjectId } from '../../types';
import type {
  PortfolioHoldingView,
  PortfolioParser,
  PortfolioSummary,
} from '../../types';

/** File types the import endpoint can turn into text. PDF is not supported. */
export const ACCEPTED_EXTENSIONS =
  '.csv,.tsv,.txt,.xlsx,.xls,.xlsm,.ods,.json,.html,.htm,.md';

/** Money with the lot's own currency code; falls back to a plain number. */
export function fmtCurrency(
  value: number | null | undefined,
  currency?: string | null,
  decimals = 2,
): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const code = currency && /^[A-Z]{3}$/.test(currency) ? currency : null;
  if (code) {
    try {
      return value.toLocaleString('en-US', {
        style: 'currency',
        currency: code,
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
    } catch {
      // Unknown ISO code: fall through to a bare number.
    }
  }
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function parserLabel(
  parser: PortfolioParser,
  model?: string | null,
): string {
  if (parser === 'llm') return model ? `AI · ${model}` : 'AI model';
  return 'Built-in parser';
}

export function holdingId(holding: PortfolioHoldingView): string | undefined {
  return extractObjectId(holding._id);
}

export function holdingKey(
  holding: PortfolioHoldingView,
  index: number,
): string {
  return (
    holdingId(holding) ??
    `${holding.symbol}-${holding.account ?? ''}-${holding.currency ?? ''}-${index}`
  );
}

/** The currency that carries most of the portfolio value, for headline stats. */
export function primaryTotal(summary: PortfolioSummary | undefined) {
  if (!summary?.totals.length) return undefined;
  return [...summary.totals].sort((a, b) => b.market_value - a.market_value)[0];
}
