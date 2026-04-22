import React, { useEffect, useState } from 'react';
import { Box, Button, IconButton, Menu, Portal, Spinner, Text, VStack } from '@chakra-ui/react';
import { Star } from 'lucide-react';
import { api } from '../../api';
import { Watchlist } from '../../types';
import { toaster } from '../ui/toaster';

/**
 * One-click "add this symbol to a watchlist" button. Filled when the symbol
 * is already on at least one watchlist.
 *
 * Lists are fetched on first open (and memoised for the component's lifetime)
 * to keep the rendered-all-over-the-place case cheap.
 */
export const WatchButton: React.FC<{ symbol: string; size?: 'xs' | 'sm' | 'md' }> = ({
  symbol,
  size = 'sm',
}) => {
  const [open, setOpen] = useState(false);
  const [watchlists, setWatchlists] = useState<Watchlist[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const upper = symbol.toUpperCase();

  const load = async () => {
    try {
      setWatchlists(await api.alerts.listWatchlists());
    } catch {
      setWatchlists([]);
    }
  };

  useEffect(() => {
    // Fetch once per page-mount so the star reflects current state.
    load();
  }, []);

  const isWatched = !!watchlists?.some(w => w.symbols.includes(upper));

  const iconSize = size === 'xs' ? 14 : size === 'sm' ? 16 : 18;

  const handleToggle = async (wl: Watchlist) => {
    if (!wl._id) return;
    setBusy(wl._id);
    try {
      if (wl.symbols.includes(upper)) {
        await api.alerts.removeSymbol(wl._id, upper);
        toaster.create({ title: `${upper} removed from ${wl.name}`, type: 'info' });
      } else {
        await api.alerts.addSymbol(wl._id, upper);
        toaster.create({ title: `${upper} added to ${wl.name}`, type: 'success' });
      }
      await load();
    } catch (e: any) {
      toaster.create({ title: 'Failed', description: e?.message, type: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const handleCreateAndAdd = async () => {
    const name = window.prompt('New watchlist name:');
    if (!name) return;
    try {
      const wl = await api.alerts.createWatchlist(name.trim(), [upper]);
      toaster.create({ title: `Added to ${wl.name}`, type: 'success' });
      await load();
    } catch (e: any) {
      toaster.create({ title: 'Failed', description: e?.message, type: 'error' });
    }
  };

  return (
    <Menu.Root open={open} onOpenChange={(d: { open: boolean }) => setOpen(d.open)}>
      <Menu.Trigger asChild>
        <IconButton
          size={size}
          variant="ghost"
          aria-label={isWatched ? 'Manage watchlists' : 'Watch'}
          color={isWatched ? 'yellow.300' : 'gray.400'}
          _hover={{ color: 'yellow.300', bg: 'whiteAlpha.200' }}
        >
          <Star size={iconSize} fill={isWatched ? 'currentColor' : 'none'} />
        </IconButton>
      </Menu.Trigger>
      <Portal>
        <Menu.Positioner>
          <Menu.Content bg="gray.800" borderColor="gray.700">
            <Box px={3} py={2} borderBottom="1px solid" borderColor="gray.700">
              <Text color="gray.400" fontSize="xs">Watchlists for {upper}</Text>
            </Box>
            {watchlists === null && <Box p={3}><Spinner size="sm" /></Box>}
            {watchlists && watchlists.length === 0 && (
              <Box p={3}>
                <Text color="gray.400" fontSize="sm" mb={2}>No watchlists yet.</Text>
              </Box>
            )}
            <VStack align="stretch" gap={0} maxH="260px" overflow="auto">
              {watchlists?.map(wl => {
                const has = wl.symbols.includes(upper);
                return (
                  <Menu.Item
                    key={wl._id}
                    value={wl._id || ''}
                    closeOnSelect={false}
                    onClick={() => handleToggle(wl)}
                    disabled={busy === wl._id}
                  >
                    <Text color="white" flex={1}>
                      {has ? '✓ ' : '  '} {wl.name}
                    </Text>
                    <Text color="gray.500" fontSize="xs">{wl.symbols.length}</Text>
                  </Menu.Item>
                );
              })}
            </VStack>
            <Box borderTop="1px solid" borderColor="gray.700" p={2}>
              <Button size="xs" colorPalette="blue" w="full" onClick={handleCreateAndAdd}>
                + New watchlist with {upper}
              </Button>
            </Box>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
};
