/**
 * Shared null-safe number/date formatters. All return an em-dash ('—' by
 * default) for null/undefined/non-finite input so table cells render cleanly.
 */

const isFiniteNumber = (v: number | null | undefined): v is number =>
  v != null && Number.isFinite(v);

const compactNumber = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

const compactCurrency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});

const marketCap = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumSignificantDigits: 3,
});

export function fmtMoney(
  v: number | null | undefined,
  decimals = 2,
  fallback = '—',
): string {
  if (!isFiniteNumber(v)) return fallback;
  return v.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function fmtPct(
  v: number | null | undefined,
  decimals = 2,
  opts?: { sign?: boolean },
): string {
  if (!isFiniteNumber(v)) return '—';
  const formatted = v.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    signDisplay: opts?.sign ? 'always' : 'auto',
  });
  return `${formatted}%`;
}

export function fmtCompactNumber(v: number | null | undefined): string {
  return isFiniteNumber(v) ? compactNumber.format(v) : '—';
}

export function fmtCompactCurrency(v: number | null | undefined): string {
  return isFiniteNumber(v) ? compactCurrency.format(v) : '—';
}

export function fmtMarketCap(v: number | null | undefined): string {
  return isFiniteNumber(v) ? marketCap.format(v) : '—';
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  // Date-only strings parse as UTC midnight; build them in local time so the
  // displayed day never shifts in timezones behind UTC.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const d = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
