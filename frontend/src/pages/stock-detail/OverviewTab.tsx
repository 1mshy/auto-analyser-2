import React from 'react';
import { SimpleGrid } from '@chakra-ui/react';
import { Calendar, TrendingDown, TrendingUp } from 'lucide-react';
import { StockAnalysis, EarningsData } from '../../types';
import { Callout, StatBlock } from '../../components/ui/primitives';
import { fmtCompactCurrency, fmtMoney, shortDate } from '../../format';

export interface OverviewTabProps {
  stock: StockAnalysis;
  earnings?: EarningsData | null;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({ stock, earnings }) => {
  const rsiIntent =
    stock.rsi && stock.rsi < 30 ? 'up' : stock.rsi && stock.rsi > 70 ? 'down' : 'neutral';
  const macdBullish = stock.macd ? stock.macd.histogram > 0 : null;

  const earningsDays = earnings?.earnings_date
    ? Math.ceil((new Date(earnings.earnings_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;
  const estimateParts = [
    earnings?.eps_estimate != null ? `EPS estimate ${fmtMoney(earnings.eps_estimate)}` : null,
    earnings?.revenue_estimate != null
      ? `Revenue estimate ${fmtCompactCurrency(earnings.revenue_estimate)}`
      : null,
  ].filter(Boolean);

  return (
    <>
      {earnings?.earnings_date && (
        <Callout
          tone="warn"
          icon={<Calendar size={16} />}
          mb={4}
          title={`Upcoming earnings — ${shortDate(earnings.earnings_date)} (${earningsDays} days)`}
        >
          {estimateParts.length > 0 ? estimateParts.join(' · ') : undefined}
        </Callout>
      )}

      <SimpleGrid columns={{ base: 2, md: 4 }} gap={3} mb={4}>
        <StatBlock label="RSI (14)" value={stock.rsi} valueDecimals={1} valueIntent={rsiIntent} />
        <StatBlock label="SMA 20" value={stock.sma_20} valuePrefix="$" valueDecimals={2} />
        <StatBlock label="SMA 50" value={stock.sma_50} valuePrefix="$" valueDecimals={2} />
        <StatBlock
          label="MACD"
          value={macdBullish == null ? null : macdBullish ? 'Bullish' : 'Bearish'}
          icon={
            macdBullish == null ? undefined : macdBullish ? (
              <TrendingUp size={14} />
            ) : (
              <TrendingDown size={14} />
            )
          }
        />
      </SimpleGrid>

      <SimpleGrid columns={{ base: 2, md: 4 }} gap={3}>
        <StatBlock label="Market Cap" value={stock.market_cap} valuePrefix="$" valueCompact />
        <StatBlock label="Volume" value={stock.volume} valueCompact />
        {stock.technicals?.pe_ratio != null && typeof stock.technicals.pe_ratio === 'number' && (
          <StatBlock label="P/E Ratio" value={stock.technicals.pe_ratio} valueDecimals={2} />
        )}
        {stock.technicals?.eps != null && typeof stock.technicals.eps === 'number' && (
          <StatBlock label="EPS" value={stock.technicals.eps} valuePrefix="$" valueDecimals={2} />
        )}
      </SimpleGrid>
    </>
  );
};
