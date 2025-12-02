import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Box, Flex, Text, HStack, Container, Badge } from '@chakra-ui/react';
import { Home, List, TrendingUp, Activity } from 'lucide-react';

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

          {/* Status Badge */}
          {totalStocks !== undefined && (
            <HStack gap={2}>
              <Badge colorPalette="green" size="lg" px={3} py={1}>
                {analyzedCount?.toLocaleString() || 0} / {totalStocks?.toLocaleString()} Analyzed
              </Badge>
            </HStack>
          )}
        </Flex>
      </Container>
    </Box>
  );
};
