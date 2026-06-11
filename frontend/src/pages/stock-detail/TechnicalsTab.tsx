import React from 'react';
import { Heading, HStack, Separator, SimpleGrid, Text, VStack } from '@chakra-ui/react';
import { StockAnalysis } from '../../types';
import { Num, SignalBadge, Surface } from '../../components/ui/primitives';

const IndicatorRow: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <HStack justify="space-between" w="100%">
    <Text color="fg.muted">{label}</Text>
    {children}
  </HStack>
);

const IndicatorCard: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <Surface variant="raised" p={{ base: 4, md: 5 }}>
    <Heading size="sm" color="fg.default" mb={4}>
      {title}
    </Heading>
    {children}
  </Surface>
);

export interface TechnicalsTabProps {
  stock: StockAnalysis;
}

export const TechnicalsTab: React.FC<TechnicalsTabProps> = ({ stock }) => {
  return (
    <SimpleGrid columns={{ base: 1, md: 2 }} gap={{ base: 4, md: 6 }}>
      {/* MACD Details */}
      <IndicatorCard title="MACD Indicator">
        {stock.macd ? (
          <VStack align="start" gap={2}>
            <IndicatorRow label="MACD Line">
              <Num value={stock.macd.macd_line} decimals={4} />
            </IndicatorRow>
            <IndicatorRow label="Signal Line">
              <Num value={stock.macd.signal_line} decimals={4} />
            </IndicatorRow>
            <IndicatorRow label="Histogram">
              <Num
                value={stock.macd.histogram}
                decimals={4}
                intent={stock.macd.histogram > 0 ? 'up' : 'down'}
              />
            </IndicatorRow>
            <Separator my={2} />
            <SignalBadge tone={stock.macd.histogram > 0 ? 'up' : 'down'} size="lg">
              {stock.macd.histogram > 0 ? 'Bullish Signal' : 'Bearish Signal'}
            </SignalBadge>
          </VStack>
        ) : (
          <Text color="fg.subtle">MACD data not available</Text>
        )}
      </IndicatorCard>

      {/* Moving Averages */}
      <IndicatorCard title="Moving Averages">
        <VStack align="start" gap={2}>
          <IndicatorRow label="Price">
            <Num value={stock.price} prefix="$" decimals={2} />
          </IndicatorRow>
          <IndicatorRow label="SMA 20">
            <Num
              value={stock.sma_20}
              prefix="$"
              decimals={2}
              intent={
                stock.sma_20 != null && stock.price != null && stock.price > stock.sma_20
                  ? 'up'
                  : 'down'
              }
            />
          </IndicatorRow>
          <IndicatorRow label="SMA 50">
            <Num
              value={stock.sma_50}
              prefix="$"
              decimals={2}
              intent={
                stock.sma_50 != null && stock.price != null && stock.price > stock.sma_50
                  ? 'up'
                  : 'down'
              }
            />
          </IndicatorRow>
          <Separator my={2} />
          {stock.sma_20 && stock.sma_50 && (
            <SignalBadge tone={stock.sma_20 > stock.sma_50 ? 'up' : 'down'} size="lg">
              {stock.sma_20 > stock.sma_50 ? 'Golden Cross' : 'Death Cross'}
            </SignalBadge>
          )}
        </VStack>
      </IndicatorCard>

      {/* 52-Week Range */}
      {stock.technicals && (
        <IndicatorCard title="52-Week Range">
          <VStack align="start" gap={2}>
            <IndicatorRow label="52-Week High">
              <Num value={stock.technicals.fifty_two_week_high} prefix="$" decimals={2} />
            </IndicatorRow>
            <IndicatorRow label="52-Week Low">
              <Num value={stock.technicals.fifty_two_week_low} prefix="$" decimals={2} />
            </IndicatorRow>
            <IndicatorRow label="Previous Close">
              <Num value={stock.technicals.previous_close} prefix="$" decimals={2} />
            </IndicatorRow>
          </VStack>
        </IndicatorCard>
      )}

      {/* Bollinger Bands */}
      <IndicatorCard title="Bollinger Bands (20, 2)">
        {stock.bollinger ? (
          <VStack align="start" gap={2}>
            <IndicatorRow label="Upper Band">
              <Num value={stock.bollinger.upper_band} prefix="$" decimals={2} intent="down" />
            </IndicatorRow>
            <IndicatorRow label="Middle Band (SMA 20)">
              <Num value={stock.bollinger.middle_band} prefix="$" decimals={2} />
            </IndicatorRow>
            <IndicatorRow label="Lower Band">
              <Num value={stock.bollinger.lower_band} prefix="$" decimals={2} intent="up" />
            </IndicatorRow>
            <IndicatorRow label="Bandwidth">
              <Num value={stock.bollinger.bandwidth} decimals={4} />
            </IndicatorRow>
            <Separator my={2} />
            <SignalBadge
              tone={
                stock.price <= stock.bollinger.lower_band
                  ? 'up'
                  : stock.price >= stock.bollinger.upper_band
                  ? 'down'
                  : 'neutral'
              }
              size="lg"
            >
              {stock.price <= stock.bollinger.lower_band
                ? 'Near Lower Band (Potential Buy)'
                : stock.price >= stock.bollinger.upper_band
                ? 'Near Upper Band (Potential Sell)'
                : 'Within Bands'}
            </SignalBadge>
          </VStack>
        ) : (
          <Text color="fg.subtle">Bollinger Bands data not available</Text>
        )}
      </IndicatorCard>

      {/* Stochastic Oscillator */}
      <IndicatorCard title="Stochastic Oscillator (14, 3)">
        {stock.stochastic ? (
          <VStack align="start" gap={2}>
            <IndicatorRow label="%K Line">
              <Num
                value={stock.stochastic.k_line}
                decimals={2}
                intent={
                  stock.stochastic.k_line < 20
                    ? 'up'
                    : stock.stochastic.k_line > 80
                    ? 'down'
                    : 'neutral'
                }
              />
            </IndicatorRow>
            <IndicatorRow label="%D Line">
              <Num
                value={stock.stochastic.d_line}
                decimals={2}
                intent={
                  stock.stochastic.d_line < 20
                    ? 'up'
                    : stock.stochastic.d_line > 80
                    ? 'down'
                    : 'neutral'
                }
              />
            </IndicatorRow>
            <Separator my={2} />
            <SignalBadge
              tone={
                stock.stochastic.k_line < 20 ? 'up' : stock.stochastic.k_line > 80 ? 'down' : 'neutral'
              }
              size="lg"
            >
              {stock.stochastic.k_line < 20
                ? 'Oversold (<20)'
                : stock.stochastic.k_line > 80
                ? 'Overbought (>80)'
                : 'Neutral'}
            </SignalBadge>
            {stock.stochastic.k_line > stock.stochastic.d_line ? (
              <SignalBadge tone="up" size="sm">
                %K above %D (Bullish)
              </SignalBadge>
            ) : (
              <SignalBadge tone="down" size="sm">
                %K below %D (Bearish)
              </SignalBadge>
            )}
          </VStack>
        ) : (
          <Text color="fg.subtle">Stochastic data not available</Text>
        )}
      </IndicatorCard>

      {/* Dividend Info */}
      {stock.technicals && stock.technicals.annualized_dividend && (
        <IndicatorCard title="Dividend Info">
          <VStack align="start" gap={2}>
            <IndicatorRow label="Annual Dividend">
              <Num value={stock.technicals.annualized_dividend} prefix="$" decimals={2} />
            </IndicatorRow>
            <IndicatorRow label="Yield">
              <Num value={stock.technicals.current_yield} suffix="%" decimals={2} intent="up" />
            </IndicatorRow>
            {stock.technicals.ex_dividend_date && (
              <IndicatorRow label="Ex-Dividend Date">
                <Text color="fg.default">{stock.technicals.ex_dividend_date}</Text>
              </IndicatorRow>
            )}
          </VStack>
        </IndicatorCard>
      )}
    </SimpleGrid>
  );
};
