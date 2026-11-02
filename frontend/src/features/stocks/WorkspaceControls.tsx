import { useState } from 'react';
import {
  Box,
  Button,
  CloseButton,
  Drawer,
  Field,
  Flex,
  HStack,
  IconButton,
  Input,
  NativeSelect,
  Text,
  VStack,
} from '@chakra-ui/react';
import { Bookmark, Check, Columns3, Link2, Trash2, X } from 'lucide-react';
import type { StockFilter } from '../../types';
import { Checkbox } from '../../components/ui/checkbox';
import {
  activeFilterChips,
  DEFAULT_PREFERENCES,
  SORT_OPTIONS,
  STOCK_COLUMNS,
  type SavedView,
  type WorkspacePreferences,
} from './workspace';

export function ActiveFilters({
  filter,
  onRemove,
  onClear,
}: {
  filter: StockFilter;
  onRemove: (key: keyof StockFilter) => void;
  onClear: () => void;
}) {
  const chips = activeFilterChips(filter);
  if (!chips.length) return null;
  return (
    <HStack
      wrap="wrap"
      gap={2}
      py={3}
      borderTopWidth="1px"
      borderColor="border.subtle"
    >
      {chips.map((chip) => (
        <Button
          key={chip.key}
          size="xs"
          variant="subtle"
          bg="accent.muted"
          color="accent.fg"
          minH="8"
          aria-label={`Remove ${chip.label}`}
          onClick={() => onRemove(chip.key)}
        >
          {chip.label}
          <X size={12} />
        </Button>
      ))}
      <Button
        size="xs"
        variant="ghost"
        color="fg.muted"
        minH="8"
        onClick={onClear}
      >
        Clear filters
      </Button>
    </HStack>
  );
}

export function SortControl({
  filter,
  onChange,
}: {
  filter: StockFilter;
  onChange: (field: string, order: string) => void;
}) {
  return (
    <NativeSelect.Root size="sm" w="auto" minW="142px">
      <NativeSelect.Field
        aria-label="Sort stocks"
        value={`${filter.sort_by ?? 'market_cap'}:${filter.sort_order ?? 'desc'}`}
        onChange={(event) => {
          const [field, order] = event.target.value.split(':');
          onChange(field, order);
        }}
        bg="bg.surface"
        color="fg.default"
      >
        {SORT_OPTIONS.flatMap((option) =>
          ['desc', 'asc'].map((order) => (
            <option
              key={`${option.value}:${order}`}
              value={`${option.value}:${order}`}
              aria-label={`${option.label}, ${order === 'desc' ? 'high to low' : 'low to high'}`}
            >
              {option.label} {order === 'desc' ? '↓' : '↑'}
            </option>
          )),
        )}
      </NativeSelect.Field>
      <NativeSelect.Indicator />
    </NativeSelect.Root>
  );
}

export function WorkspaceControls({
  preferences,
  onPreferencesChange,
  views,
  onSave,
  onLoad,
  onDelete,
  storageError,
  defaults = DEFAULT_PREFERENCES,
}: {
  preferences: WorkspacePreferences;
  onPreferencesChange: (next: WorkspacePreferences) => void;
  views: SavedView[];
  onSave: (name: string) => boolean;
  onLoad: (view: SavedView) => void;
  onDelete: (id: string) => void;
  storageError: boolean;
  defaults?: WorkspacePreferences;
}) {
  const [panel, setPanel] = useState<'layout' | 'views' | null>(null);
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        aria-label={`Saved views${views.length > 0 ? ` (${views.length})` : ''}`}
        onClick={() => setPanel('views')}
      >
        <Bookmark size={15} />
        <Text as="span" display={{ base: 'none', md: 'inline' }}>
          Saved views
        </Text>
        <Text as="span" display={{ base: 'inline', md: 'none' }}>
          Saved
        </Text>
        {views.length > 0 ? ` (${views.length})` : ''}
      </Button>
      <Button
        size="sm"
        variant="outline"
        aria-label="Customize"
        onClick={() => setPanel('layout')}
      >
        <Columns3 size={15} />
        <Text as="span" display={{ base: 'none', md: 'inline' }}>
          Customize
        </Text>
        <Text as="span" display={{ base: 'inline', md: 'none' }}>
          Display
        </Text>
      </Button>
      <Drawer.Root
        open={panel !== null}
        onOpenChange={(event) => {
          if (!event.open) setPanel(null);
        }}
        placement="end"
        size="sm"
      >
        <Drawer.Backdrop />
        <Drawer.Positioner>
          <Drawer.Content bg="bg.surface" color="fg.default">
            <Drawer.Header borderBottomWidth="1px" borderColor="border.subtle">
              <Drawer.Title>
                {panel === 'layout' ? 'Make this view yours' : 'Saved views'}
              </Drawer.Title>
              <Drawer.CloseTrigger asChild>
                <CloseButton size="sm" />
              </Drawer.CloseTrigger>
            </Drawer.Header>
            <Drawer.Body>
              {panel === 'layout' ? (
                <VStack align="stretch" gap={6}>
                  <Box>
                    <Text fontWeight="semibold" mb={2}>
                      Display
                    </Text>
                    <HStack>
                      {(['table', 'card'] as const).map((view) => (
                        <Button
                          key={view}
                          size="sm"
                          variant={
                            preferences.view === view ? 'solid' : 'outline'
                          }
                          aria-pressed={preferences.view === view}
                          onClick={() =>
                            onPreferencesChange({ ...preferences, view })
                          }
                        >
                          {view === 'table' ? 'Table' : 'Cards'}
                        </Button>
                      ))}
                    </HStack>
                    <Text fontSize="xs" color="fg.muted" mt={2}>
                      Small screens automatically use cards.
                    </Text>
                  </Box>
                  <Box>
                    <Text fontWeight="semibold" mb={2}>
                      Table spacing
                    </Text>
                    <HStack>
                      {(['comfortable', 'compact'] as const).map((density) => (
                        <Button
                          key={density}
                          size="sm"
                          variant={
                            preferences.density === density
                              ? 'solid'
                              : 'outline'
                          }
                          aria-pressed={preferences.density === density}
                          onClick={() =>
                            onPreferencesChange({ ...preferences, density })
                          }
                        >
                          {density === 'compact' ? 'Compact' : 'Comfortable'}
                        </Button>
                      ))}
                    </HStack>
                  </Box>
                  <Box>
                    <Text fontWeight="semibold" mb={1}>
                      Visible columns
                    </Text>
                    <Text fontSize="sm" color="fg.muted" mb={3}>
                      Symbol always stays visible.
                    </Text>
                    <VStack align="stretch" gap={3}>
                      {STOCK_COLUMNS.map((column) => (
                        <Checkbox
                          key={column.id}
                          checked={preferences.columns.includes(column.id)}
                          disabled={
                            preferences.columns.length === 1 &&
                            preferences.columns.includes(column.id)
                          }
                          onCheckedChange={(event) =>
                            onPreferencesChange({
                              ...preferences,
                              columns: event.checked
                                ? [...preferences.columns, column.id]
                                : preferences.columns.filter(
                                    (id) => id !== column.id,
                                  ),
                            })
                          }
                        >
                          {column.label}
                        </Checkbox>
                      ))}
                    </VStack>
                  </Box>
                  <Button
                    variant="outline"
                    onClick={() => onPreferencesChange(defaults)}
                  >
                    Restore default layout
                  </Button>
                </VStack>
              ) : (
                <VStack align="stretch" gap={4}>
                  <Text color="fg.muted" fontSize="sm">
                    Save your filters, search, sort order and layout together.
                    Views are stored in this browser.
                  </Text>
                  <Box
                    as="form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (name.trim()) {
                        setSaved(onSave(name));
                        setName('');
                      }
                    }}
                  >
                    <Field.Root>
                      <Field.Label>View name</Field.Label>
                      <Input
                        maxLength={80}
                        placeholder="e.g. Large-cap momentum"
                        value={name}
                        onChange={(event) => {
                          setName(event.target.value);
                          setSaved(false);
                        }}
                      />
                    </Field.Root>
                    <Button
                      type="submit"
                      w="full"
                      mt={3}
                      disabled={!name.trim()}
                    >
                      <Bookmark size={15} />
                      Save current view
                    </Button>
                    {saved && (
                      <HStack color="signal.up.fg" mt={2} role="status">
                        <Check size={14} />
                        <Text fontSize="sm">View saved</Text>
                      </HStack>
                    )}
                  </Box>
                  {views.length === 0 && (
                    <Text fontSize="sm" color="fg.muted" py={4}>
                      Your saved views will appear here.
                    </Text>
                  )}
                  {views.map((view) => (
                    <Flex
                      key={view.id}
                      align="center"
                      borderWidth="1px"
                      borderColor="border.subtle"
                      borderRadius="md"
                      p={2}
                      gap={1}
                    >
                      <Button
                        flex="1"
                        minW={0}
                        justifyContent="flex-start"
                        variant="ghost"
                        onClick={() => {
                          onLoad(view);
                          setPanel(null);
                        }}
                      >
                        <Text truncate>{view.name}</Text>
                      </Button>
                      <IconButton
                        aria-label={`Delete ${view.name}`}
                        title={`Delete ${view.name}`}
                        variant="ghost"
                        size="sm"
                        onClick={() => onDelete(view.id)}
                      >
                        <Trash2 size={15} />
                      </IconButton>
                    </Flex>
                  ))}
                </VStack>
              )}
              {storageError && (
                <Text mt={4} color="signal.down.fg" fontSize="sm" role="alert">
                  Your changes work for this visit, but browser storage is
                  unavailable.
                </Text>
              )}
            </Drawer.Body>
            <Drawer.Footer>
              <Button variant="outline" onClick={() => setPanel(null)}>
                Done
              </Button>
            </Drawer.Footer>
          </Drawer.Content>
        </Drawer.Positioner>
      </Drawer.Root>
    </>
  );
}

export function ShareViewButton() {
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  return (
    <Box>
      <Button
        size="sm"
        variant="ghost"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(window.location.href);
            setStatus('copied');
          } catch {
            setStatus('error');
          }
        }}
      >
        {status === 'copied' ? <Check size={15} /> : <Link2 size={15} />}
        {status === 'copied' ? 'Link copied' : 'Share filters'}
      </Button>
      {status === 'error' && (
        <Text role="status" fontSize="xs" color="fg.muted">
          Copy this page’s address to share.
        </Text>
      )}
    </Box>
  );
}
