import React, { useRef } from 'react';
import { Box, Button, HStack } from '@chakra-ui/react';

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
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const current = tabs.findIndex(t => t.id === active);
    const next =
      e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : e.key === 'ArrowRight'
        ? (current + 1) % tabs.length
        : (current - 1 + tabs.length) % tabs.length;
    onChange(tabs[next].id);
    buttonRefs.current[next]?.focus();
  };

  return (
    <Box mb={5} overflowX="auto" borderBottomWidth="1px" borderColor="border.default">
      <HStack
        role="tablist"
        aria-label="Stock detail sections"
        gap={1}
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
              id={`stock-tab-${tab.id}`}
              aria-controls={`stock-panel-${tab.id}`}
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              size="sm"
              minH={{ base: 11, md: 8 }}
              variant="ghost"
              color={isActive ? 'accent.fg' : 'fg.muted'}
              bg="transparent"
              borderRadius="0"
              borderBottomWidth="2px"
              borderColor={isActive ? 'accent.solid' : 'transparent'}
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
    </Box>
  );
};
