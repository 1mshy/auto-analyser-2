import { ChakraProvider, defaultSystem } from '@chakra-ui/react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceControls } from './WorkspaceControls';
import { useWorkspace } from './useWorkspace';
import { WORKSPACE_KEY } from './model';
function Harness() {
  const workspace = useWorkspace();
  return (
    <ChakraProvider value={defaultSystem}>
      <WorkspaceControls {...workspace} />
      <output data-testid="layout">{JSON.stringify(workspace.layout)}</output>
    </ChakraProvider>
  );
}
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
    })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe('workspace customization', () => {
  it('persists keyboard-accessible panel ordering, width and visibility across remounts', async () => {
    const view = render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Customize' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Move Market movers up' }),
    );
    fireEvent.change(
      screen.getByRole('combobox', { name: 'Market movers width' }),
      { target: { value: '12' } },
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Hide Oversold radar' }),
    );
    const stored = JSON.parse(localStorage.getItem(WORKSPACE_KEY)!);
    expect(stored.layouts[0].widgets[0]).toEqual({ id: 'movers', width: 12 });
    expect(
      stored.layouts[0].widgets.some(
        (item: { id: string }) => item.id === 'oversold',
      ),
    ).toBe(false);
    view.unmount();
    render(<Harness />);
    const layout = JSON.parse(screen.getByTestId('layout').textContent!);
    expect(layout.widgets).toEqual(stored.layouts[0].widgets);
  });
  it('duplicates the active layout under a name and switches without changing the source', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'New layout' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(
      within(dialog).getByRole('textbox', { name: 'New layout name' }),
      { target: { value: 'My watch desk' } },
    );
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Create layout' }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    const layout = JSON.parse(screen.getByTestId('layout').textContent!);
    expect(layout.name).toBe('My watch desk');
    expect(
      JSON.parse(localStorage.getItem(WORKSPACE_KEY)!).layouts,
    ).toHaveLength(4);
    fireEvent.change(
      screen.getByRole('combobox', { name: 'Workspace layout' }),
      { target: { value: 'overview' } },
    );
    expect(screen.getByTestId('layout')).toHaveTextContent('Market overview');
  });
  it('keeps the workspace usable when browser storage is denied', () => {
    const spy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('Storage denied');
      });
    render(<Harness />);
    expect(screen.getByText(/browser storage is unavailable/)).toHaveAttribute(
      'role',
      'status',
    );
    fireEvent.change(
      screen.getByRole('combobox', { name: 'Workspace layout' }),
      { target: { value: 'monitor' } },
    );
    expect(screen.getByTestId('layout')).toHaveTextContent('Daily monitor');
    spy.mockRestore();
  });
});
