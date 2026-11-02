import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { useWorkspacePreferences } from './useWorkspacePreferences';

beforeEach(() => {
  localStorage.clear();
});

it('persists filters, layout and density together, and restores them after remount', () => {
  const first = renderHook(() => useWorkspacePreferences('stocks'));
  act(() =>
    first.result.current.updatePreferences({
      columns: ['price', 'rsi'],
      view: 'table',
      density: 'compact',
    }),
  );
  act(() =>
    first.result.current.saveView('  My shortlist  ', {
      max_rsi: 30,
      symbol_search: 'A',
      sort_by: 'rsi',
      sort_order: 'asc',
      page: 8,
    }),
  );
  first.unmount();
  const second = renderHook(() => useWorkspacePreferences('stocks'));
  expect(second.result.current.preferences.density).toBe('compact');
  expect(second.result.current.views[0]).toMatchObject({
    name: 'My shortlist',
    filter: { max_rsi: 30, symbol_search: 'A', page: 1 },
    preferences: { columns: ['price', 'rsi'], density: 'compact' },
  });
  act(() =>
    second.result.current.deleteView(second.result.current.views[0].id),
  );
  second.unmount();
  expect(
    renderHook(() => useWorkspacePreferences('stocks')).result.current.views,
  ).toEqual([]);
});

it('keeps changes usable when storage is blocked and reports that they are temporary', () => {
  const setItem = vi
    .spyOn(Storage.prototype, 'setItem')
    .mockImplementation(() => {
      throw new Error('blocked');
    });
  const hook = renderHook(() => useWorkspacePreferences('stocks'));
  act(() =>
    hook.result.current.updatePreferences({
      columns: ['price'],
      view: 'card',
      density: 'compact',
    }),
  );
  expect(hook.result.current.preferences.view).toBe('card');
  expect(hook.result.current.storageError).toBe(true);
  setItem.mockRestore();
});
