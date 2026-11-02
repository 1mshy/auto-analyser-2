import React from 'react';
import { ChakraProvider, defaultSystem } from '@chakra-ui/react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsPanel from './SettingsPanel';
import { SettingsProvider, useSettings } from '../contexts/SettingsContext';
import { SETTINGS_PRESETS } from '../types';

vi.mock('./ui/toaster', () => ({ toaster: { create: vi.fn() } }));

function CurrentSettings() {
  const { settings } = useSettings();
  return <output data-testid="saved-settings">{JSON.stringify(settings)}</output>;
}

function renderSettings() {
  return render(
    <ChakraProvider value={defaultSystem}>
      <SettingsProvider>
        <SettingsPanel />
        <CurrentSettings />
      </SettingsProvider>
    </ChakraProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
  })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('settings draft', () => {
  it('discards a preset selection on Cancel and restores saved values when reopened', async () => {
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const all = await screen.findByRole('button', { name: /Show All/ });
    fireEvent.click(all);
    expect(all).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('saved-settings')).toHaveTextContent(JSON.stringify(SETTINGS_PRESETS.quality));

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(await screen.findByRole('button', { name: /Quality/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('slider', { name: 'Maximum daily price change' })).toHaveAttribute('aria-valuetext', '25 percent');
  });

  it('commits the chosen preset only on Apply, keeping its name and true thresholds', async () => {
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(await screen.findByRole('button', { name: /Large Cap/ }));
    expect(screen.getByTestId('saved-settings')).toHaveTextContent(JSON.stringify(SETTINGS_PRESETS.quality));
    expect(screen.getByRole('slider', { name: 'Maximum daily price change' })).toHaveAttribute('aria-valuetext', '15 percent');
    fireEvent.click(screen.getByRole('button', { name: 'Apply Settings' }));
    await waitFor(() => expect(screen.getByTestId('saved-settings')).toHaveTextContent(JSON.stringify(SETTINGS_PRESETS.large_cap)));
    expect(JSON.parse(localStorage.getItem('stock_analyzer_global_settings')!)).toEqual(SETTINGS_PRESETS.large_cap);
  });

  it('keeps a keyboard slider edit as a draft and commits it as a custom setting', async () => {
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(await screen.findByRole('button', { name: /Large Cap/ }));
    const slider = screen.getByRole('slider', { name: 'Maximum daily price change' });
    fireEvent.focus(slider);
    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    await waitFor(() => expect(slider).toHaveAttribute('aria-valuetext', '20 percent'));
    expect(screen.getByTestId('saved-settings')).toHaveTextContent(JSON.stringify(SETTINGS_PRESETS.quality));
    fireEvent.click(screen.getByRole('button', { name: 'Apply Settings' }));
    await waitFor(() => expect(screen.getByTestId('saved-settings')).toHaveTextContent(JSON.stringify({
      minMarketCap: 10_000_000_000, maxPriceChangePercent: 20, preset: 'custom',
    })));
  });
});
