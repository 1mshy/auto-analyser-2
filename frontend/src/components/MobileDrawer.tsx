import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Box,
  Drawer,
  HStack,
  VStack,
  Text,
  CloseButton,
} from '@chakra-ui/react';
import { Activity } from 'lucide-react';
import { navigation, isNavigationActive } from '../app/navigation';

export interface MobileDrawerNavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
}
export const MOBILE_NAV_ITEMS: MobileDrawerNavItem[] = navigation.flatMap(
  (group) =>
    group.items.map((item) => ({ ...item, icon: <item.icon size={18} /> })),
);

const MobileDrawer: React.FC<{
  open: boolean;
  onClose: () => void;
  unread?: number;
}> = ({ open, onClose, unread = 0 }) => {
  const location = useLocation();
  return (
    <Drawer.Root
      open={open}
      onOpenChange={(event) => {
        if (!event.open) onClose();
      }}
      placement="start"
      size="xs"
    >
      <Drawer.Backdrop />
      <Drawer.Positioner>
        <Drawer.Content bg="bg.surface" maxW="min(320px, 90vw)">
          <Drawer.Header borderBottomWidth="1px" borderColor="border.subtle">
            <Drawer.Title>
              <HStack>
                <Box color="accent.fg">
                  <Activity size={20} />
                </Box>
                <Text>Auto Analyser</Text>
              </HStack>
            </Drawer.Title>
            <Drawer.CloseTrigger asChild>
              <CloseButton aria-label="Close navigation" size="sm" />
            </Drawer.CloseTrigger>
          </Drawer.Header>
          <Drawer.Body as="nav" aria-label="Mobile navigation" py={5}>
            {navigation.map((group) => (
              <Box key={group.label} mb={5}>
                <Text color="fg.subtle" fontSize="xs" mb={2} px={3}>
                  {group.label}
                </Text>
                <VStack align="stretch" gap={1}>
                  {group.items.map((item) => {
                    const active = isNavigationActive(
                      location.pathname,
                      item.to,
                    );
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        onClick={onClose}
                        aria-current={active ? 'page' : undefined}
                      >
                        <HStack
                          px={3}
                          minH="44px"
                          gap={3}
                          borderRadius="md"
                          bg={active ? 'accent.muted' : 'transparent'}
                          color={active ? 'accent.fg' : 'fg.muted'}
                        >
                          <item.icon size={18} />
                          <Text fontSize="sm" flex={1} whiteSpace="nowrap">
                            {item.label}
                          </Text>
                          {item.to === '/alerts' && unread > 0 && (
                            <Text fontSize="xs">{unread}</Text>
                          )}
                        </HStack>
                      </Link>
                    );
                  })}
                </VStack>
              </Box>
            ))}
          </Drawer.Body>
        </Drawer.Content>
      </Drawer.Positioner>
    </Drawer.Root>
  );
};
export default MobileDrawer;
