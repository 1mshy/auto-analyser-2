import React, { useEffect } from 'react';
import { Box } from '@chakra-ui/react';

const toTradingViewSymbol = (symbol: string): string => {
  const upper = symbol.toUpperCase();
  if (upper.endsWith('.TO') || upper.endsWith('.V') || upper.endsWith('.NE') || upper.endsWith('.CN')) {
    return `TSX:${upper.replace(/\.(TO|V|NE|CN)$/, '')}`;
  }
  return upper.replace('-', '.');
};

export interface TradingViewWidgetProps {
  symbol: string;
}

export const TradingViewWidget: React.FC<TradingViewWidgetProps> = ({ symbol }) => {
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.async = true;
    script.innerHTML = JSON.stringify({
      "autosize": true,
      "symbol": toTradingViewSymbol(symbol),
      "interval": "D",
      "timezone": "Etc/UTC",
      "theme": "dark",
      "style": "1",
      "locale": "en",
      "enable_publishing": false,
      "hide_top_toolbar": false,
      "hide_legend": false,
      "save_image": false,
      "calendar": false,
      "support_host": "https://www.tradingview.com"
    });

    const container = document.getElementById('tradingview-widget');
    if (container) {
      container.innerHTML = '';
      const widgetContainer = document.createElement('div');
      widgetContainer.className = 'tradingview-widget-container__widget';
      widgetContainer.style.height = '100%';
      widgetContainer.style.width = '100%';
      container.appendChild(widgetContainer);
      widgetContainer.appendChild(script);
    }

    return () => {
      const cleanupContainer = document.getElementById('tradingview-widget');
      if (cleanupContainer) {
        cleanupContainer.innerHTML = '';
      }
    };
  }, [symbol]);

  return (
    <Box id="tradingview-widget" h="500px" w="100%" bg="bg.inset" borderWidth="1px" borderColor="border.subtle" borderRadius="md" />
  );
};
