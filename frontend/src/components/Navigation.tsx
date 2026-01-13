import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Box, Flex, Text, HStack, Container, Badge } from '@chakra-ui/react';
import { Home, List, TrendingUp, Activity } from 'lucide-react';
import SettingsPanel from './SettingsPanel';
import { useSettings } from '../contexts/SettingsContext';

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  isActive: boolean;
}

const NavItem: React.FC<NavItemProps> = ({ to, icon, label, isActive }) => (
  <Link to={to}>
    <HStack
      px={4}
      py={2}
      borderRadius="md"
      bg={isActive ? 'blue.500' : 'transparent'}
      color={isActive ? 'white' : 'gray.300'}
      _hover={{ bg: isActive ? 'blue.600' : 'whiteAlpha.200' }}
      transition="all 0.2s"
      cursor="pointer"
    >
      {icon}
      <Text fontWeight={isActive ? 'semibold' : 'medium'}>{label}</Text>
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

  // Format market cap for display
  const formatMarketCap = (value: number | null) => {
    if (!value) return '';
    if (value >= 1_000_000_000_000) return `$${(value / 1_000_000_000_000).toFixed(0)}T+`;
    if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(0)}B+`;
    return `$${(value / 1_000_000).toFixed(0)}M+`;
  };

  return (
    <Box 
      as="nav" 
      bg="gray.900" 
      borderBottom="1px" 
      borderColor="gray.700"
      position="sticky"
      top={0}
      zIndex={100}
    >
      <Container maxW="container.xl">
        <Flex align="center" justify="space-between" h={16}>
          {/* Logo */}
          <Link to="/">
            <HStack gap={2}>
              <Box color="blue.400"><Activity size={24} /></Box>
              <Text fontSize="xl" fontWeight="bold" color="white">
                Stock Analyser
              </Text>
            </HStack>
          </Link>

          {/* Navigation Links */}
          <HStack gap={2}>
            <NavItem
              to="/"
              icon={<Home size={18} />}
              label="Dashboard"
              isActive={location.pathname === '/'}
            />
            <NavItem
              to="/stocks"
              icon={<List size={18} />}
              label="All Stocks"
              isActive={location.pathname === '/stocks'}
            />
            <NavItem
              to="/opportunities"
              icon={<TrendingUp size={18} />}
              label="Opportunities"
              isActive={location.pathname === '/opportunities'}
            />
          </HStack>

          {/* Right Side: Status + Settings */}
          <HStack gap={3}>
            {/* Filter Active Indicator */}
            {isFiltered && (
              <Badge colorPalette="orange" size="lg" px={3} py={1}>
                {settings.minMarketCap && formatMarketCap(settings.minMarketCap)}
                {settings.minMarketCap && settings.maxPriceChangePercent && ' | '}
                {settings.maxPriceChangePercent && `±${settings.maxPriceChangePercent}%`}
              </Badge>
            )}

            {/* Status Badge */}
            {totalStocks !== undefined && (
              <Badge colorPalette="green" size="lg" px={3} py={1}>
                {analyzedCount?.toLocaleString() || 0} / {totalStocks?.toLocaleString()} Analyzed
              </Badge>
            )}

            {/* Settings Panel */}
            <SettingsPanel />
          </HStack>
        </Flex>
      </Container>
    </Box>
  );
};
