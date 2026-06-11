import React, { useRef } from 'react';
import { Button, HStack } from '@chakra-ui/react';
import { Surface } from '../../components/ui/primitives';

export type StockDetailTabId =
  | 'overview'
  | 'about'
  | 'technicals'
  | 'chart'
  | 'ai'
  | 'news'
  | 'insiders';

export interface StockDetailTab {
  id: StockDetailTabId;
  label: string;
  icon?: React.ReactNode;
}

export interface TabBarProps {
  tabs: StockDetailTab[];
  active: StockDetailTabId;
  onChange: (id: StockDetailTabId) => void;
}

/**
 * Data-driven, keyboard-accessible tab bar (roving tabindex + arrow keys).
 * Scrolls horizontally at narrow widths instead of wrapping.
 */
export const TabBar: React.FC<TabBarProps> = ({ tabs, active, onChange }) => {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const current = tabs.findIndex(t => t.id === active);
    const next =
      e.key === 'ArrowRight'
        ? (current + 1) % tabs.length
        : (current - 1 + tabs.length) % tabs.length;
    onChange(tabs[next].id);
    buttonRefs.current[next]?.focus();
  };

  return (
    <Surface p={2} mb={5} overflowX="auto" variant="inset">
      <HStack
        role="tablist"
        aria-label="Stock detail sections"
        gap={2}
        wrap="nowrap"
        minW="max-content"
        onKeyDown={handleKeyDown}
      >
        {tabs.map((tab, i) => {
          const isActive = tab.id === active;
          return (
            <Button
              key={tab.id}
              ref={(el: HTMLButtonElement | null) => {
                buttonRefs.current[i] = el;
              }}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              size="sm"
              minH={{ base: 11, md: 8 }}
              variant="ghost"
              color={isActive ? 'accent.fg' : 'fg.muted'}
              bg={isActive ? 'accent.subtle' : 'transparent'}
              borderWidth="1px"
              borderColor={isActive ? 'accent.muted' : 'transparent'}
              _hover={{
                bg: isActive ? 'accent.subtle' : 'bg.muted',
                color: isActive ? 'accent.fg' : 'fg.default',
              }}
              onClick={() => onChange(tab.id)}
            >
              {tab.icon}
              {tab.label}
            </Button>
          );
        })}
      </HStack>
    </Surface>
  );
};
