import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Box,
  Drawer,
  HStack,
  VStack,
  Text,
} from '@chakra-ui/react';
import {
  Home,
  List,
  TrendingUp,
  Activity,
  BarChart3,
  Newspaper,
  PieChart,
  Search,
  Bell,
  FlaskConical,
} from 'lucide-react';
import { SignalBadge } from './ui/primitives';

export interface MobileDrawerNavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
}

// Single source of truth for the mobile nav list. Mirrors `Navigation.tsx`.
export const MOBILE_NAV_ITEMS: MobileDrawerNavItem[] = [
  { to: '/', label: 'Dashboard', icon: <Home size={18} /> },
  { to: '/stocks', label: 'All Stocks', icon: <List size={18} /> },
  { to: '/opportunities', label: 'Opportunities', icon: <TrendingUp size={18} /> },
  { to: '/funds', label: 'Funds', icon: <BarChart3 size={18} /> },
  { to: '/news', label: 'News', icon: <Newspaper size={18} /> },
  { to: '/sectors', label: 'Sectors', icon: <PieChart size={18} /> },
  { to: '/screener', label: 'Screener', icon: <Search size={18} /> },
  { to: '/backtest', label: 'Backtest', icon: <FlaskConical size={18} /> },
  { to: '/alerts', label: 'Alerts', icon: <Bell size={18} /> },
];

interface MobileDrawerProps {
  open: boolean;
  onClose: () => void;
  unread?: number;
}

const MobileDrawer: React.FC<MobileDrawerProps> = ({ open, onClose, unread = 0 }) => {
  const location = useLocation();

  return (
    <Drawer.Root
      open={open}
      onOpenChange={(e: any) => (e.open ? null : onClose())}
      placement="start"
      size="xs"
    >
      <Drawer.Backdrop />
      <Drawer.Positioner>
        <Drawer.Content
          bg="bg.surface"
          borderRightWidth="1px"
          borderColor="border.default"
        >
          <Drawer.Header borderBottomWidth="1px" borderColor="border.subtle">
            <Drawer.Title color="fg.default">
              <HStack gap={2}>
                <Box
                  color="accent.fg"
                  bg="accent.subtle"
                  borderWidth="1px"
                  borderColor="accent.muted"
                  borderRadius="md"
                  p={1.5}
                  lineHeight={0}
                >
                  <Activity size={16} />
                </Box>
                <Text fontWeight="semibold">Stock Analyser</Text>
              </HStack>
            </Drawer.Title>
            <Drawer.CloseTrigger />
          </Drawer.Header>

          <Drawer.Body>
            <VStack gap={1} align="stretch" py={2}>
              {MOBILE_NAV_ITEMS.map((item) => {
                const isActive = location.pathname === item.to;
                const showUnread = item.to === '/alerts' && unread > 0;
                return (
                  <Link key={item.to} to={item.to} onClick={onClose}>
                    <HStack
                      px={3}
                      py={2.5}
                      gap={3}
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
                      {item.icon}
                      <Text
                        fontSize="sm"
                        fontWeight={isActive ? 'semibold' : 'medium'}
                        flex={1}
                      >
                        {item.label}
                      </Text>
                      {showUnread && (
                        <SignalBadge
                          tone="down"
                          variant="solid"
                          size="xs"
                          borderRadius="full"
                          minW="20px"
                          h="20px"
                          px={1.5}
                          fontSize="10px"
                          lineHeight="20px"
                        >
                          {unread > 99 ? '99+' : unread}
                        </SignalBadge>
                      )}
                    </HStack>
                  </Link>
                );
              })}
            </VStack>
          </Drawer.Body>
        </Drawer.Content>
      </Drawer.Positioner>
    </Drawer.Root>
  );
};

export default MobileDrawer;
