import { useState } from 'react';
import type { StockFilter } from '../../types';
import {
  decodeSavedViews,
  DEFAULT_PREFERENCES,
  sanitizePreferences,
  type SavedView,
  type WorkspacePreferences,
} from './workspace';

export function useWorkspacePreferences(
  scope: 'stocks' | 'screener',
  defaults = DEFAULT_PREFERENCES,
) {
  const preferencesKey = `stock_analyzer_${scope}_layout_v1`;
  const viewsKey = `stock_analyzer_${scope}_views_v1`;
  const [preferences, setPreferences] = useState<WorkspacePreferences>(() => {
    try {
      return sanitizePreferences(
        JSON.parse(localStorage.getItem(preferencesKey) ?? 'null'),
        defaults,
      );
    } catch {
      return sanitizePreferences(null, defaults);
    }
  });
  const [views, setViews] = useState<SavedView[]>(() => {
    try {
      return decodeSavedViews(
        localStorage.getItem(viewsKey) ??
          localStorage.getItem(
            scope === 'screener'
              ? 'screener_presets'
              : 'stock_analyzer_saved_filters',
          ),
        defaults,
      );
    } catch {
      return [];
    }
  });
  const [storageError, setStorageError] = useState(false);
  const persist = (key: string, value: unknown) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      setStorageError(false);
      return true;
    } catch {
      setStorageError(true);
      return false;
    }
  };
  const updatePreferences = (next: WorkspacePreferences) => {
    setPreferences(next);
    persist(preferencesKey, next);
  };
  const saveView = (name: string, filter: StockFilter) => {
    const view: SavedView = {
      id: crypto.randomUUID(),
      name: name.trim().slice(0, 80),
      filter: { ...filter, page: 1 },
      preferences: { ...preferences, columns: [...preferences.columns] },
    };
    const next = [...views, view];
    setViews(next);
    return persist(viewsKey, next);
  };
  const deleteView = (id: string) => {
    const next = views.filter((view) => view.id !== id);
    setViews(next);
    persist(viewsKey, next);
  };
  return {
    preferences,
    updatePreferences,
    views,
    saveView,
    deleteView,
    storageError,
  };
}
