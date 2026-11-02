import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  Box,
  Button,
  CloseButton,
  Dialog,
  Drawer,
  Flex,
  HStack,
  IconButton,
  Input,
  NativeSelect,
  Text,
  VStack,
} from '@chakra-ui/react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import {
  moveWidget,
  presets,
  updateLayout,
  widgetCatalog,
  type WidgetId,
  type WidgetWidth,
  type WorkspaceState,
} from './model';

type Props = {
  state: WorkspaceState;
  setState: Dispatch<SetStateAction<WorkspaceState>>;
  storageError: boolean;
};
export function WorkspaceControls({ state, setState, storageError }: Props) {
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [notice, setNotice] = useState('');
  const layout = state.layouts.find((item) => item.id === state.activeId)!;
  const update = (fn: Parameters<typeof updateLayout>[1]) =>
    setState((previous) => updateLayout(previous, fn));
  return (
    <>
      <Flex gap={2} wrap="wrap" align="center" mb={5}>
        <NativeSelect.Root size="sm" w={{ base: '100%', sm: '230px' }}>
          <NativeSelect.Field
            aria-label="Workspace layout"
            value={state.activeId}
            onChange={(event) =>
              setState((previous) => ({
                ...previous,
                activeId: event.target.value,
              }))
            }
            bg="bg.surface"
            borderColor="border.default"
          >
            {state.layouts.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
        <Button
          size="sm"
          variant="outline"
          borderColor="border.default"
          onClick={() => setOpen(true)}
        >
          <SlidersHorizontal size={15} />
          Customize
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setName(`${layout.name} copy`.slice(0, 40));
            setCreateOpen(true);
          }}
          disabled={state.layouts.length >= 8}
        >
          <Copy size={14} />
          New layout
        </Button>
        <Text
          ml={{ sm: 'auto' }}
          fontSize="xs"
          color={storageError ? 'signal.warn.fg' : 'fg.subtle'}
          role="status"
        >
          {storageError
            ? 'Changes stay in this session; browser storage is unavailable.'
            : 'Layouts saved in this browser'}
        </Text>
      </Flex>
      <Drawer.Root
        open={open}
        onOpenChange={(event) => setOpen(event.open)}
        size="sm"
      >
        <Drawer.Backdrop />
        <Drawer.Positioner>
          <Drawer.Content bg="bg.surface" maxW="min(440px, 100vw)">
            <Drawer.Header>
              <Drawer.Title>Make this view yours</Drawer.Title>
              <Drawer.CloseTrigger asChild>
                <CloseButton aria-label="Close customization" size="sm" />
              </Drawer.CloseTrigger>
            </Drawer.Header>
            <Drawer.Body>
              <Text fontSize="sm" color="fg.muted" mb={5}>
                Choose panels, adjust their width, and put the most useful
                information first. Changes save as you go.
              </Text>
              <Text asChild fontSize="sm" fontWeight="medium">
                <label htmlFor="layout-name">Layout name</label>
              </Text>
              <Input
                id="layout-name"
                value={layout.name}
                maxLength={40}
                onChange={(event) => {
                  const value = event.target.value;
                  update((current) => ({ ...current, name: value }));
                }}
                onBlur={() => {
                  if (!layout.name.trim())
                    update((current) => ({ ...current, name: 'My workspace' }));
                }}
                mt={2}
                mb={6}
              />
              <Text fontSize="sm" fontWeight="semibold" mb={3}>
                Visible panels · {layout.widgets.length}
              </Text>
              <VStack align="stretch" gap={3}>
                {layout.widgets.map((widget, index) => (
                  <Box
                    key={widget.id}
                    p={3}
                    borderWidth="1px"
                    borderColor="border.default"
                    borderRadius="md"
                  >
                    <Flex align="center" justify="space-between" gap={2} mb={2}>
                      <Text fontSize="sm" fontWeight="medium">
                        {widgetCatalog[widget.id].title}
                      </Text>
                      <IconButton
                        aria-label={`Hide ${widgetCatalog[widget.id].title}`}
                        variant="ghost"
                        size="xs"
                        onClick={() =>
                          update((current) => ({
                            ...current,
                            widgets: current.widgets.filter(
                              (item) => item.id !== widget.id,
                            ),
                          }))
                        }
                      >
                        <Trash2 size={14} />
                      </IconButton>
                    </Flex>
                    <HStack>
                      <IconButton
                        aria-label={`Move ${widgetCatalog[widget.id].title} up`}
                        variant="outline"
                        size="xs"
                        disabled={index === 0}
                        onClick={() => {
                          update((current) => ({
                            ...current,
                            widgets: moveWidget(current.widgets, widget.id, -1),
                          }));
                          setNotice(
                            `${widgetCatalog[widget.id].title} moved up`,
                          );
                        }}
                      >
                        <ArrowUp size={14} />
                      </IconButton>
                      <IconButton
                        aria-label={`Move ${widgetCatalog[widget.id].title} down`}
                        variant="outline"
                        size="xs"
                        disabled={index === layout.widgets.length - 1}
                        onClick={() => {
                          update((current) => ({
                            ...current,
                            widgets: moveWidget(current.widgets, widget.id, 1),
                          }));
                          setNotice(
                            `${widgetCatalog[widget.id].title} moved down`,
                          );
                        }}
                      >
                        <ArrowDown size={14} />
                      </IconButton>
                      <NativeSelect.Root size="xs" ml="auto" w="150px">
                        <NativeSelect.Field
                          aria-label={`${widgetCatalog[widget.id].title} width`}
                          value={widget.width}
                          onChange={(event) => {
                            const width = Number(
                              event.target.value,
                            ) as WidgetWidth;
                            update((current) => ({
                              ...current,
                              widgets: current.widgets.map((item) =>
                                item.id === widget.id
                                  ? { ...item, width }
                                  : item,
                              ),
                            }));
                          }}
                        >
                          <option value={4}>One third</option>
                          <option value={6}>Half width</option>
                          <option value={8}>Two thirds</option>
                          <option value={12}>Full width</option>
                        </NativeSelect.Field>
                        <NativeSelect.Indicator />
                      </NativeSelect.Root>
                    </HStack>
                  </Box>
                ))}
              </VStack>
              <Text className="sr-only" role="status">
                {notice}
              </Text>
              <Text fontSize="sm" fontWeight="semibold" mt={6} mb={3}>
                Add a panel
              </Text>
              {(Object.keys(widgetCatalog) as WidgetId[])
                .filter(
                  (id) => !layout.widgets.some((widget) => widget.id === id),
                )
                .map((id) => (
                  <Button
                    key={id}
                    variant="ghost"
                    w="full"
                    h="auto"
                    py={3}
                    justifyContent="flex-start"
                    whiteSpace="normal"
                    onClick={() =>
                      update((current) => ({
                        ...current,
                        widgets: [
                          ...current.widgets,
                          { id, width: id === 'sectors' ? 8 : 4 },
                        ],
                      }))
                    }
                  >
                    <Plus size={16} />
                    <Box textAlign="left">
                      <Text fontSize="sm">{widgetCatalog[id].title}</Text>
                      <Text color="fg.subtle" fontSize="xs" fontWeight="normal">
                        {widgetCatalog[id].description}
                      </Text>
                    </Box>
                  </Button>
                ))}
              {layout.widgets.length === Object.keys(widgetCatalog).length && (
                <Text fontSize="sm" color="fg.subtle">
                  All panels are visible.
                </Text>
              )}
              <Box
                mt={6}
                borderTopWidth="1px"
                borderColor="border.subtle"
                pt={4}
              >
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    update((current) => ({
                      ...current,
                      widgets: (
                        presets[current.id] ?? presets.overview
                      ).widgets.map((widget) => ({ ...widget })),
                    }))
                  }
                >
                  <RotateCcw size={14} />
                  Reset panels
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={state.layouts.length < 2}
                  onClick={() => {
                    setState((previous) => {
                      const layouts = previous.layouts.filter(
                        (item) => item.id !== previous.activeId,
                      );
                      return { ...previous, layouts, activeId: layouts[0].id };
                    });
                    setOpen(false);
                  }}
                >
                  <Trash2 size={14} />
                  Delete layout
                </Button>
              </Box>
            </Drawer.Body>
            <Drawer.Footer>
              <Button onClick={() => setOpen(false)} colorPalette="accent">
                <Check size={16} />
                Done
              </Button>
            </Drawer.Footer>
          </Drawer.Content>
        </Drawer.Positioner>
      </Drawer.Root>
      <Dialog.Root
        open={createOpen}
        onOpenChange={(event) => setCreateOpen(event.open)}
        placement="center"
      >
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content bg="bg.surface" mx={4}>
            <Dialog.Header>
              <Dialog.Title>Create a layout</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <Text color="fg.muted" fontSize="sm" mb={4}>
                Start with the current panels, then customize your new
                workspace.
              </Text>
              <Input
                aria-label="New layout name"
                value={name}
                maxLength={40}
                onChange={(event) => setName(event.target.value)}
              />
            </Dialog.Body>
            <Dialog.Footer>
              <Button variant="ghost" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button
                colorPalette="accent"
                disabled={!name.trim()}
                onClick={() => {
                  const id = `layout-${crypto.randomUUID()}`;
                  setState((previous) => ({
                    ...previous,
                    activeId: id,
                    layouts: [
                      ...previous.layouts,
                      {
                        id,
                        name: name.trim(),
                        widgets: layout.widgets.map((widget) => ({
                          ...widget,
                        })),
                      },
                    ],
                  }));
                  setCreateOpen(false);
                }}
              >
                Create layout
              </Button>
            </Dialog.Footer>
            <Dialog.CloseTrigger asChild>
              <CloseButton aria-label="Close create layout" size="sm" />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Dialog.Root>
    </>
  );
}
