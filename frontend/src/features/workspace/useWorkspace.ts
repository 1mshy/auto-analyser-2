import { useEffect, useState } from 'react';
import { defaultWorkspace, parseWorkspace, WORKSPACE_KEY } from './model';

export function useWorkspace() {
  const [state, setState] = useState(() => {
    try {
      return parseWorkspace(localStorage.getItem(WORKSPACE_KEY));
    } catch {
      return defaultWorkspace();
    }
  });
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem(WORKSPACE_KEY, JSON.stringify(state));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [state]);
  return {
    state,
    setState,
    storageError,
    layout: state.layouts.find((layout) => layout.id === state.activeId)!,
  };
}
