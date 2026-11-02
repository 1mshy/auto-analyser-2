import type { AIResearchInput } from '../../types';

export const MAX_RESEARCH_SYMBOLS = 4;
export const MAX_QUESTION_LENGTH = 1000;
export const RESEARCH_PROMPTS = [
  {
    label: 'Explain the indicators',
    question:
      'Explain the latest RSI and moving averages for these stocks. Where do the available signals agree or disagree, and what is missing?',
  },
  {
    label: 'Compare strength & risks',
    question:
      'Compare the technical strength and key risks of these stocks using the available data. Be explicit about uncertainty and missing indicators.',
  },
  {
    label: 'Challenge a thesis',
    question:
      'Stress-test a bullish thesis for these stocks. What supports it, what contradicts it, and what further evidence would I need before drawing a conclusion?',
  },
];

/** Mirrors the backend symbol key normalization, including Canadian listings. */
export function normalizeResearchSymbol(raw: string): string {
  const symbol = raw.trim().toUpperCase().replace(/\//g, '-');
  const dot = symbol.lastIndexOf('.');
  if (dot < 0 || ['TO', 'V', 'NE', 'CN'].includes(symbol.slice(dot + 1)))
    return symbol;
  return `${symbol.slice(0, dot)}-${symbol.slice(dot + 1)}`;
}

export function researchSymbols(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[,\s]+/)
        .filter(Boolean)
        .map(normalizeResearchSymbol),
    ),
  ];
}

export function researchInputError(input: AIResearchInput): string | undefined {
  if (input.symbols.length === 0) return 'Add at least one stock symbol.';
  if (input.symbols.length > MAX_RESEARCH_SYMBOLS)
    return 'Choose up to four distinct symbols per question.';
  if (
    input.symbols.some(
      (symbol) =>
        symbol.length > 20 ||
        !/^[A-Z0-9](?:[A-Z0-9.\-]*[A-Z0-9])?$/.test(symbol),
    )
  )
    return 'Use valid stock symbols, such as AAPL, BRK-B or SHOP.TO.';
  if (!input.question.trim())
    return 'Write a question or choose a starting prompt.';
  if (input.question.trim().length > MAX_QUESTION_LENGTH)
    return 'Keep your question to 1,000 characters or fewer.';
  return undefined;
}

export function sameResearchInput(
  a: AIResearchInput,
  b: AIResearchInput,
): boolean {
  return (
    a.question.trim() === b.question.trim() &&
    a.symbols.join(',') === b.symbols.join(',')
  );
}

export function researchTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime())
    ? 'Timestamp unavailable'
    : date.toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
}
