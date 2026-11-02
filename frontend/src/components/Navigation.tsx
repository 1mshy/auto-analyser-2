import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Box,
  Flex,
  HStack,
  IconButton,
  Input,
  Text,
  VStack,
} from '@chakra-ui/react';
import { Activity, Bell, Menu, Search, Wifi, WifiOff } from 'lucide-react';
import { navigation, isNavigationActive } from '../app/navigation';
import { useProgress } from '../contexts/ProgressContext';
import { useSettings } from '../contexts/SettingsContext';
import { useUnreadCount } from '../queries';
import { ColorModeButton } from './ui/color-mode';
import { SettingsPanel } from './SettingsPanel';
import MobileDrawer from './MobileDrawer';

interface NavigationProps {
  totalStocks?: number;
  analyzedCount?: number;
}
export const Navigation: React.FC<NavigationProps> = ({
  totalStocks,
  analyzedCount,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isConnected } = useProgress();
  const { settings, isFiltered } = useSettings();
  const { data: unread = 0 } = useUnreadCount();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const active = navigation
    .flatMap((group) => group.items)
    .find((item) => isNavigationActive(location.pathname, item.to));

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);

  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Box
        as="aside"
        className="workspace-sidebar"
        bg="bg.surface"
        borderRightWidth="1px"
        borderColor="border.subtle"
        display={{ base: 'none', lg: 'flex' }}
        flexDirection="column"
      >
        <Link to="/" aria-label="Auto Analyser home">
          <HStack px={5} h="76px" gap={2.5}>
            <Box color="accent.fg">
              <Activity size={24} strokeWidth={2} />
            </Box>
            <Box>
              <Text fontWeight="700" fontSize="sm" letterSpacing="-.03em">
                Auto Analyser
              </Text>
              <Text color="fg.subtle" fontSize="xs">
                Research workspace
              </Text>
            </Box>
          </HStack>
        </Link>
        <Box
          as="nav"
          aria-label="Main navigation"
          flex={1}
          overflowY="auto"
          px={3}
        >
          {navigation.map((group) => (
            <Box key={group.label} mb={6}>
              <Text
                px={3}
                mb={2}
                fontSize="xs"
                fontWeight="medium"
                color="fg.subtle"
              >
                {group.label}
              </Text>
              <VStack align="stretch" gap={1}>
                {group.items.map((item) => {
                  const selected = isNavigationActive(
                    location.pathname,
                    item.to,
                  );
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      aria-current={selected ? 'page' : undefined}
                    >
                      <HStack
                        px={3}
                        minH="40px"
                        gap={3}
                        borderRadius="md"
                        color={selected ? 'fg.default' : 'fg.muted'}
                        bg={selected ? 'bg.emphasized' : 'transparent'}
                        _hover={{ bg: 'bg.muted', color: 'fg.default' }}
                      >
                        <Box color={selected ? 'accent.fg' : 'fg.subtle'}>
                          <item.icon size={17} />
                        </Box>
                        <Text
                          fontSize="sm"
                          fontWeight={selected ? 'semibold' : 'normal'}
                          whiteSpace="nowrap"
                        >
                          {item.label}
                        </Text>
                        {item.to === '/alerts' && unread > 0 && (
                          <Text ml="auto" fontSize="xs" color="accent.fg">
                            {unread > 99 ? '99+' : unread}
                          </Text>
                        )}
                      </HStack>
                    </Link>
                  );
                })}
              </VStack>
            </Box>
          ))}
        </Box>
        <Box p={4} borderTopWidth="1px" borderColor="border.subtle">
          <HStack
            gap={2}
            color={isConnected ? 'signal.up.fg' : 'fg.muted'}
            fontSize="xs"
          >
            {isConnected ? <Wifi size={14} /> : <WifiOff size={14} />}
            <Text>
              {isConnected ? 'Updates connected' : 'Polling for updates'}
            </Text>
          </HStack>
          <Text color="fg.subtle" fontSize="xs" mt={2}>
            {totalStocks == null
              ? 'Waiting for analysis status'
              : `${(analyzedCount ?? 0).toLocaleString()} / ${totalStocks.toLocaleString()} analyzed`}
          </Text>
        </Box>
      </Box>
      <Box
        as="header"
        className="workspace-topbar"
        position="sticky"
        top={0}
        zIndex={20}
        bg="bg.canvas"
        borderBottomWidth="1px"
        borderColor="border.subtle"
      >
        <Flex
          h="64px"
          align="center"
          gap={{ base: 2, md: 4 }}
          px={{ base: 3, md: 6 }}
        >
          <IconButton
            aria-label="Open navigation menu"
            variant="ghost"
            size="sm"
            display={{ base: 'inline-flex', lg: 'none' }}
            onClick={() => setDrawerOpen(true)}
          >
            <Menu size={20} />
          </IconButton>
          <Text
            fontSize="sm"
            color="fg.muted"
            whiteSpace="nowrap"
            display={{ base: 'none', xl: 'block' }}
          >
            {active?.label ?? 'Research'}
          </Text>
          <Box
            as="form"
            flex={1}
            maxW="440px"
            minW={0}
            onSubmit={(event: React.FormEvent) => {
              event.preventDefault();
              if (search.trim()) {
                navigate(
                  `/stocks?symbol_search=${encodeURIComponent(search.trim())}`,
                );
                setSearch('');
                searchRef.current?.blur();
              }
            }}
          >
            <HStack
              borderWidth="1px"
              borderColor="border.default"
              borderRadius="md"
              bg="bg.surface"
              px={3}
              gap={2}
            >
              <Search size={15} aria-hidden="true" />
              <Input
                ref={searchRef}
                aria-label="Search stocks"
                placeholder="Search stocks…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                variant="flushed"
                border="0"
                h="36px"
                fontSize="sm"
                _focusVisible={{ outline: 'none' }}
              />
              <Text
                as="kbd"
                color="fg.subtle"
                fontSize="xs"
                whiteSpace="nowrap"
                display={{ base: 'none', md: 'block' }}
              >
                ⌘ K
              </Text>
            </HStack>
          </Box>
          <HStack ml="auto" gap={1}>
            {isFiltered && (
              <Text
                fontSize="xs"
                color="fg.muted"
                mr={2}
                display={{ base: 'none', md: 'block' }}
              >
                Universe:{' '}
                {settings.preset === 'custom'
                  ? 'custom'
                  : settings.preset.replace('_', ' ')}
              </Text>
            )}
            <ColorModeButton />
            <Link
              to="/alerts?tab=inbox"
              aria-label={
                unread ? `Notifications, ${unread} unread` : 'Notifications'
              }
            >
              <Box p={2} position="relative">
                <Bell size={17} />
                {unread > 0 && (
                  <Box
                    position="absolute"
                    right={1}
                    top={1}
                    w="6px"
                    h="6px"
                    borderRadius="full"
                    bg="signal.down.solid"
                  />
                )}
              </Box>
            </Link>
            <SettingsPanel showBadge={false} />
          </HStack>
        </Flex>
      </Box>
      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        unread={unread}
      />
    </>
  );
};
