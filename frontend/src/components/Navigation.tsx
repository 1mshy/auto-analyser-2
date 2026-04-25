import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Box, Flex, Text, HStack, Container } from '@chakra-ui/react';
import { Home, List, TrendingUp, Activity, BarChart3, Newspaper, PieChart, Search, Bell } from 'lucide-react';
import SettingsPanel from './SettingsPanel';
import { useSettings } from '../contexts/SettingsContext';
import { api } from '../api';
import { SignalBadge, Num } from './ui/primitives';

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
  badge?: React.ReactNode;
}

const NavItem: React.FC<NavItemProps> = ({ to, icon, label, isActive, badge }) => (
  <Link to={to}>
    <HStack
      px={3}
      py={1.5}
      gap={2}
      borderRadius="md"
      bg={isActive ? 'accent.muted' : 'transparent'}
      color={isActive ? 'accent.fg' : 'fg.muted'}
      _hover={{
        bg: isActive ? 'accent.muted' : 'bg.muted',
        color: isActive ? 'accent.fg' : 'fg.default',
      }}
      transition="background 120ms ease, color 120ms ease"
      cursor="pointer"
      position="relative"
    >
      {icon}
      <Text fontSize="sm" fontWeight={isActive ? 'semibold' : 'medium'}>{label}</Text>
      {badge}
    </HStack>
  </Link>
);

interface NavigationProps {
  totalStocks?: number;
  analyzedCount?: number;
}

export const Navigation: React.FC<NavigationProps> = ({ totalStocks, analyzedCount }) => {
  const location = useLocation();
  const { isFiltered, settings } = useSettings();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const n = await api.alerts.unreadCount();
        if (!cancelled) setUnread(n);
      } catch {
        /* ignore - API may not be ready yet */
      }
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const formatMarketCap = (value: number | null) => {
    if (!value) return '';
    if (value >= 1_000_000_000_000) return `$${(value / 1_000_000_000_000).toFixed(0)}T+`;
    if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(0)}B+`;
    return `$${(value / 1_000_000).toFixed(0)}M+`;
  };

  return (
    <Box
      as="nav"
      bg="bg.canvas"
      borderBottomWidth="1px"
      borderColor="border.subtle"
      position="sticky"
      top={0}
      zIndex={100}
      backdropFilter="saturate(140%) blur(8px)"
    >
      <Container maxW="container.xl">
        <Flex align="center" justify="space-between" h={14}>
          {/* Logo */}
          <Link to="/">
            <HStack gap={2}>
              <Box color="accent.fg"><Activity size={20} /></Box>
              <Text fontSize="md" fontWeight="semibold" color="fg.default" letterSpacing="tight">
                Stock Analyser
              </Text>
            </HStack>
          </Link>

          {/* Navigation Links */}
          <HStack gap={1}>
            <NavItem
              to="/"
              icon={<Home size={16} />}
              label="Dashboard"
              isActive={location.pathname === '/'}
            />
            <NavItem
              to="/stocks"
              icon={<List size={16} />}
              label="All Stocks"
              isActive={location.pathname === '/stocks'}
            />
            <NavItem
              to="/opportunities"
              icon={<TrendingUp size={16} />}
              label="Opportunities"
              isActive={location.pathname === '/opportunities'}
            />
            <NavItem
              to="/funds"
              icon={<BarChart3 size={16} />}
              label="Funds"
              isActive={location.pathname === '/funds'}
            />
            <NavItem
              to="/news"
              icon={<Newspaper size={16} />}
              label="News"
              isActive={location.pathname === '/news'}
            />
            <NavItem
              to="/sectors"
              icon={<PieChart size={16} />}
              label="Sectors"
              isActive={location.pathname === '/sectors'}
            />
            <NavItem
              to="/screener"
              icon={<Search size={16} />}
              label="Screener"
              isActive={location.pathname === '/screener'}
            />
            <NavItem
              to="/alerts"
              icon={<Bell size={16} />}
              label="Alerts"
              isActive={location.pathname === '/alerts'}
              badge={unread > 0 ? (
                <SignalBadge
                  tone="down"
                  variant="solid"
                  size="xs"
                  position="absolute"
                  top="0"
                  right="-1"
                  borderRadius="full"
                  minW="18px"
                  h="18px"
                  px={1.5}
                  fontSize="10px"
                  lineHeight="18px"
                >
                  {unread > 99 ? '99+' : unread}
                </SignalBadge>
              ) : undefined}
            />
          </HStack>

          {/* Right Side: Status + Settings */}
          <HStack gap={2}>
            {/* Filter Active Indicator */}
            {isFiltered && (
              <SignalBadge tone="warn" size="sm" px={2} py={1}>
                <Text className="num" data-num="" fontSize="xs">
                  {settings.minMarketCap && formatMarketCap(settings.minMarketCap)}
                  {settings.minMarketCap && settings.maxPriceChangePercent && ' | '}
                  {settings.maxPriceChangePercent && `±${settings.maxPriceChangePercent}%`}
                </Text>
              </SignalBadge>
            )}

            {/* Status Badge */}
            {totalStocks !== undefined && (
              <SignalBadge tone="up" size="sm" px={2} py={1}>
                <HStack gap={1} fontSize="xs">
                  <Num
                    value={analyzedCount ?? 0}
                    intent="neutral"
                    decimals={0}
                    fontSize="xs"
                    fontWeight="medium"
                  />
                  <Text>/</Text>
                  <Num
                    value={totalStocks}
                    intent="neutral"
                    decimals={0}
                    fontSize="xs"
                    fontWeight="medium"
                  />
                  <Text>Analyzed</Text>
                </HStack>
              </SignalBadge>
            )}

            {/* Settings Panel */}
            <SettingsPanel />
          </HStack>
        </Flex>
      </Container>
    </Box>
  );
};
