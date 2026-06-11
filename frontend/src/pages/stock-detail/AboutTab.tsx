import React from 'react';
import {
  Box,
  Flex,
  Heading,
  HStack,
  Separator,
  SimpleGrid,
  Text,
  VStack,
} from '@chakra-ui/react';
import { Building2, ExternalLink } from 'lucide-react';
import { CompanyProfile } from '../../types';
import {
  EmptyState,
  ErrorState,
  SectionLabel,
  SignalBadge,
  SkeletonText,
  StatBlock,
  Surface,
  type SignalTone,
} from '../../components/ui/primitives';

const hasValue = (value: unknown): boolean => value !== null && value !== undefined && value !== '';
const hasAnyValue = (...values: unknown[]): boolean => values.some(hasValue);

const recommendationTone = (key: string): SignalTone =>
  key === 'strong_buy' || key === 'buy'
    ? 'up'
    : key === 'hold'
    ? 'warn'
    : key === 'sell' || key === 'strong_sell'
    ? 'down'
    : 'neutral';

export interface AboutTabProps {
  symbol: string;
  profile: CompanyProfile | null | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

export const AboutTab: React.FC<AboutTabProps> = ({
  symbol,
  profile,
  isLoading,
  isError,
  onRetry,
}) => {
  return (
    <Surface variant="raised" p={{ base: 4, md: 5 }}>
      <Heading size="md" color="fg.default" mb={4}>
        About {symbol}
      </Heading>
      {isLoading ? (
        <VStack align="stretch" gap={4}>
          <SkeletonText lines={3} />
          <SimpleGrid columns={{ base: 2, md: 4 }} gap={4}>
            <SkeletonText lines={2} />
            <SkeletonText lines={2} />
            <SkeletonText lines={2} />
            <SkeletonText lines={2} />
          </SimpleGrid>
          <SkeletonText lines={6} />
        </VStack>
      ) : isError ? (
        <ErrorState
          title="Couldn’t load company profile"
          description="The company profile request failed. Retry to fetch it again."
          onRetry={onRetry}
          py={8}
        />
      ) : profile ? (
        <VStack align="start" gap={4}>
          {/* Analyst Recommendation */}
          {profile.recommendation_key && (
            <Flex align="center" gap={3}>
              <SignalBadge
                tone={recommendationTone(profile.recommendation_key)}
                size="lg"
                px={3}
                py={1}
                fontSize="md"
              >
                {profile.recommendation_key.replace('_', ' ').toUpperCase()}
              </SignalBadge>
              {profile.number_of_analyst_opinions && (
                <Text color="fg.muted" fontSize="sm">
                  Based on {profile.number_of_analyst_opinions} analyst
                  {profile.number_of_analyst_opinions > 1 ? 's' : ''}
                </Text>
              )}
            </Flex>
          )}

          {/* Price Targets */}
          {(profile.target_mean_price || profile.target_high_price || profile.target_low_price) && (
            <Surface variant="inset" w="100%" p={4}>
              <SectionLabel mb={3}>Analyst Price Targets</SectionLabel>
              <SimpleGrid columns={{ base: 2, md: 4 }} gap={4}>
                {profile.current_price && (
                  <StatBlock bare size="sm" label="Current" value={profile.current_price} valuePrefix="$" valueDecimals={2} p={0} />
                )}
                {profile.target_low_price && (
                  <StatBlock bare size="sm" label="Target Low" value={profile.target_low_price} valuePrefix="$" valueDecimals={2} valueIntent="down" p={0} />
                )}
                {profile.target_mean_price && (
                  <StatBlock
                    bare
                    size="sm"
                    label="Target Mean"
                    value={profile.target_mean_price}
                    valuePrefix="$"
                    valueDecimals={2}
                    valueIntent="info"
                    delta={
                      profile.current_price
                        ? ((profile.target_mean_price - profile.current_price) / profile.current_price) * 100
                        : undefined
                    }
                    deltaSuffix="%"
                    p={0}
                  />
                )}
                {profile.target_high_price && (
                  <StatBlock bare size="sm" label="Target High" value={profile.target_high_price} valuePrefix="$" valueDecimals={2} valueIntent="up" p={0} />
                )}
              </SimpleGrid>
            </Surface>
          )}

          {/* Valuation */}
          {hasAnyValue(
            profile.market_cap,
            profile.enterprise_value,
            profile.beta,
            profile.trailing_pe,
            profile.forward_pe,
            profile.peg_ratio,
            profile.price_to_book,
            profile.book_value,
            profile.trailing_eps,
            profile.forward_eps
          ) && (
            <>
              <SectionLabel>Valuation</SectionLabel>
              <SimpleGrid columns={{ base: 2, md: 4 }} gap={4} w="100%">
                {profile.market_cap != null && (
                  <StatBlock size="sm" label="Market Cap" value={profile.market_cap} valuePrefix="$" valueCompact />
                )}
                {profile.enterprise_value != null && (
                  <StatBlock size="sm" label="Enterprise Value" value={profile.enterprise_value} valuePrefix="$" valueCompact />
                )}
                {profile.beta != null && (
                  <StatBlock size="sm" label="Beta" value={profile.beta} valueDecimals={2} />
                )}
                {profile.trailing_pe != null && (
                  <StatBlock size="sm" label="Trailing P/E" value={profile.trailing_pe} valueDecimals={2} />
                )}
                {profile.forward_pe != null && (
                  <StatBlock size="sm" label="Forward P/E" value={profile.forward_pe} valueDecimals={2} />
                )}
                {profile.peg_ratio != null && (
                  <StatBlock size="sm" label="PEG Ratio" value={profile.peg_ratio} valueDecimals={2} />
                )}
                {profile.price_to_book != null && (
                  <StatBlock size="sm" label="Price/Book" value={profile.price_to_book} valueDecimals={2} />
                )}
                {profile.book_value != null && (
                  <StatBlock size="sm" label="Book Value" value={profile.book_value} valuePrefix="$" valueDecimals={2} />
                )}
                {profile.trailing_eps != null && (
                  <StatBlock size="sm" label="Trailing EPS" value={profile.trailing_eps} valuePrefix="$" valueDecimals={2} />
                )}
                {profile.forward_eps != null && (
                  <StatBlock size="sm" label="Forward EPS" value={profile.forward_eps} valuePrefix="$" valueDecimals={2} />
                )}
              </SimpleGrid>
              <Separator />
            </>
          )}

          {/* Trading Statistics */}
          {hasAnyValue(
            profile.average_volume,
            profile.average_volume_10_day,
            profile.fifty_two_week_high,
            profile.fifty_two_week_low,
            profile.fifty_day_average,
            profile.two_hundred_day_average
          ) && (
            <>
              <SectionLabel>Trading Statistics</SectionLabel>
              <SimpleGrid columns={{ base: 2, md: 4 }} gap={4} w="100%">
                {profile.average_volume != null && (
                  <StatBlock size="sm" label="Avg Volume" value={profile.average_volume} valueCompact />
                )}
                {profile.average_volume_10_day != null && (
                  <StatBlock size="sm" label="10D Avg Volume" value={profile.average_volume_10_day} valueCompact />
                )}
                {profile.fifty_two_week_low != null && (
                  <StatBlock size="sm" label="52W Low" value={profile.fifty_two_week_low} valuePrefix="$" valueDecimals={2} />
                )}
                {profile.fifty_two_week_high != null && (
                  <StatBlock size="sm" label="52W High" value={profile.fifty_two_week_high} valuePrefix="$" valueDecimals={2} />
                )}
                {profile.fifty_day_average != null && (
                  <StatBlock size="sm" label="50D Average" value={profile.fifty_day_average} valuePrefix="$" valueDecimals={2} />
                )}
                {profile.two_hundred_day_average != null && (
                  <StatBlock size="sm" label="200D Average" value={profile.two_hundred_day_average} valuePrefix="$" valueDecimals={2} />
                )}
              </SimpleGrid>
              <Separator />
            </>
          )}

          {/* Business Description */}
          {profile.long_business_summary && (
            <Box>
              <SectionLabel mb={2}>Description</SectionLabel>
              <Text color="fg.default" lineHeight="tall">
                {profile.long_business_summary}
              </Text>
            </Box>
          )}

          <Separator />

          {/* Financial Metrics */}
          {hasAnyValue(
            profile.profit_margins,
            profile.gross_margins,
            profile.return_on_equity,
            profile.total_revenue,
            profile.revenue_growth,
            profile.earnings_growth,
            profile.net_income_to_common
          ) && (
            <>
              <SectionLabel>Financial Metrics</SectionLabel>
              <SimpleGrid columns={{ base: 2, md: 4 }} gap={4} w="100%">
                {profile.profit_margins != null && (
                  <StatBlock size="sm" label="Profit Margin" value={profile.profit_margins * 100} valueSuffix="%" valueDecimals={1} valueIntent="auto" />
                )}
                {profile.gross_margins != null && (
                  <StatBlock size="sm" label="Gross Margin" value={profile.gross_margins * 100} valueSuffix="%" valueDecimals={1} />
                )}
                {profile.operating_margins != null && (
                  <StatBlock size="sm" label="Operating Margin" value={profile.operating_margins * 100} valueSuffix="%" valueDecimals={1} valueIntent="auto" />
                )}
                {profile.return_on_equity != null && (
                  <StatBlock size="sm" label="Return on Equity" value={profile.return_on_equity * 100} valueSuffix="%" valueDecimals={1} valueIntent="auto" />
                )}
                {profile.total_revenue != null && (
                  <StatBlock size="sm" label="Total Revenue" value={profile.total_revenue} valuePrefix="$" valueCompact />
                )}
                {profile.revenue_per_share != null && (
                  <StatBlock size="sm" label="Revenue/Share" value={profile.revenue_per_share} valuePrefix="$" valueDecimals={2} />
                )}
                {profile.free_cash_flow != null && (
                  <StatBlock size="sm" label="Free Cash Flow" value={profile.free_cash_flow} valuePrefix="$" valueCompact valueIntent="auto" />
                )}
                {profile.revenue_growth != null && (
                  <StatBlock size="sm" label="Revenue Growth" value={profile.revenue_growth * 100} valueSuffix="%" valueDecimals={1} valueIntent="auto" />
                )}
                {profile.earnings_growth != null && (
                  <StatBlock size="sm" label="Earnings Growth" value={profile.earnings_growth * 100} valueSuffix="%" valueDecimals={1} valueIntent="auto" />
                )}
                {profile.net_income_to_common != null && (
                  <StatBlock size="sm" label="Net Income" value={profile.net_income_to_common} valuePrefix="$" valueCompact valueIntent="auto" />
                )}
              </SimpleGrid>
              <Separator />
            </>
          )}

          {/* Dividends */}
          {hasAnyValue(profile.dividend_rate, profile.dividend_yield, profile.payout_ratio) && (
            <>
              <SectionLabel>Dividends</SectionLabel>
              <SimpleGrid columns={{ base: 2, md: 4 }} gap={4} w="100%">
                {profile.dividend_rate != null && (
                  <StatBlock size="sm" label="Dividend Rate" value={profile.dividend_rate} valuePrefix="$" valueDecimals={2} />
                )}
                {profile.dividend_yield != null && (
                  <StatBlock size="sm" label="Dividend Yield" value={profile.dividend_yield * 100} valueSuffix="%" valueDecimals={1} />
                )}
                {profile.payout_ratio != null && (
                  <StatBlock size="sm" label="Payout Ratio" value={profile.payout_ratio * 100} valueSuffix="%" valueDecimals={1} />
                )}
              </SimpleGrid>
              <Separator />
            </>
          )}

          {/* Share Structure */}
          {hasAnyValue(
            profile.shares_outstanding,
            profile.float_shares,
            profile.held_percent_insiders,
            profile.held_percent_institutions
          ) && (
            <>
              <SectionLabel>Share Structure</SectionLabel>
              <SimpleGrid columns={{ base: 2, md: 4 }} gap={4} w="100%">
                {profile.shares_outstanding != null && (
                  <StatBlock size="sm" label="Shares Outstanding" value={profile.shares_outstanding} valueCompact />
                )}
                {profile.float_shares != null && (
                  <StatBlock size="sm" label="Float Shares" value={profile.float_shares} valueCompact />
                )}
                {profile.held_percent_insiders != null && (
                  <StatBlock size="sm" label="Insider Held" value={profile.held_percent_insiders * 100} valueSuffix="%" valueDecimals={1} />
                )}
                {profile.held_percent_institutions != null && (
                  <StatBlock size="sm" label="Institution Held" value={profile.held_percent_institutions * 100} valueSuffix="%" valueDecimals={1} />
                )}
              </SimpleGrid>
              <Separator />
            </>
          )}

          {/* Key Info Grid */}
          <SimpleGrid columns={{ base: 1, md: 2 }} gap={4} w="100%">
            {(profile.long_name || profile.short_name) && (
              <Box>
                <SectionLabel>Company Name</SectionLabel>
                <Text color="fg.default" fontWeight="semibold" mt={1}>
                  {profile.long_name || profile.short_name}
                </Text>
              </Box>
            )}

            {(profile.exchange_name || profile.exchange || profile.currency || profile.quote_type) && (
              <Box>
                <SectionLabel>Listing</SectionLabel>
                <HStack mt={1} wrap="wrap">
                  {profile.exchange_name && (
                    <SignalBadge tone="neutral">{profile.exchange_name}</SignalBadge>
                  )}
                  {profile.exchange && (
                    <SignalBadge tone="neutral">{profile.exchange}</SignalBadge>
                  )}
                  {profile.currency && <SignalBadge tone="up">{profile.currency}</SignalBadge>}
                  {profile.quote_type && (
                    <SignalBadge tone="warn">{profile.quote_type}</SignalBadge>
                  )}
                </HStack>
              </Box>
            )}

            {(profile.industry || profile.sector) && (
              <Box>
                <SectionLabel>Industry / Sector</SectionLabel>
                <HStack mt={1} wrap="wrap">
                  {profile.industry && <SignalBadge tone="info">{profile.industry}</SignalBadge>}
                  {profile.sector && <SignalBadge tone="accent">{profile.sector}</SignalBadge>}
                </HStack>
              </Box>
            )}

            {profile.website && (
              <Box>
                <SectionLabel>Website</SectionLabel>
                <a href={profile.website} target="_blank" rel="noopener noreferrer">
                  <HStack color="accent.fg" _hover={{ color: 'accent.solid' }} mt={1}>
                    <Text>{profile.website.replace(/^https?:\/\//, '')}</Text>
                    <ExternalLink size={14} />
                  </HStack>
                </a>
              </Box>
            )}

            {profile.full_time_employees && (
              <Box>
                <SectionLabel>Employees</SectionLabel>
                <Text color="fg.default" fontWeight="semibold" mt={1} className="num" data-num="">
                  {profile.full_time_employees.toLocaleString()}
                </Text>
              </Box>
            )}

            {(profile.city || profile.state || profile.country) && (
              <Box>
                <SectionLabel>Headquarters</SectionLabel>
                <Text color="fg.default" mt={1}>
                  {[profile.city, profile.state, profile.country].filter(Boolean).join(', ')}
                </Text>
              </Box>
            )}

            {profile.phone && (
              <Box>
                <SectionLabel>Phone</SectionLabel>
                <Text color="fg.default" mt={1}>
                  {profile.phone}
                </Text>
              </Box>
            )}
          </SimpleGrid>
        </VStack>
      ) : (
        <EmptyState
          icon={<Building2 size={28} />}
          title="No company profile"
          description="Company profile information is not available for this stock."
          py={8}
        />
      )}
    </Surface>
  );
};
