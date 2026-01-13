import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { GlobalSettings, DEFAULT_SETTINGS, SETTINGS_PRESETS } from '../types';

const SETTINGS_STORAGE_KEY = 'stock_analyzer_global_settings';

interface SettingsContextType {
  settings: GlobalSettings;
  updateSettings: (newSettings: Partial<GlobalSettings>) => void;
  applyPreset: (preset: 'all' | 'quality' | 'large_cap') => void;
  resetSettings: () => void;
  isFiltered: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<GlobalSettings>(() => {
    // Load from localStorage on initial render
    try {
      const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return { ...DEFAULT_SETTINGS, ...parsed };
      }
    } catch (e) {
      console.error('Failed to load settings from localStorage:', e);
    }
    return DEFAULT_SETTINGS;
  });

  // Persist to localStorage whenever settings change
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      console.error('Failed to save settings to localStorage:', e);
    }
  }, [settings]);

  const updateSettings = useCallback((newSettings: Partial<GlobalSettings>) => {
    setSettings(prev => ({
      ...prev,
      ...newSettings,
      preset: 'custom', // When manually updating, switch to custom preset
    }));
  }, []);

  const applyPreset = useCallback((preset: 'all' | 'quality' | 'large_cap') => {
    setSettings(SETTINGS_PRESETS[preset]);
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);

  // Check if any filters are actively applied
  const isFiltered = settings.minMarketCap !== null || settings.maxPriceChangePercent !== null;

  return (
    <SettingsContext.Provider value={{
      settings,
      updateSettings,
      applyPreset,
      resetSettings,
      isFiltered,
    }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = (): SettingsContextType => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};


