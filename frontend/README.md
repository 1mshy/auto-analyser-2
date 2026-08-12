# Auto Stock Analyser - Frontend

Vite + React + TypeScript frontend with Chakra UI for real-time stock analysis.

## Features

- 🎨 **Chakra UI** - Modern, accessible component library
- 🔄 **Real-time Updates** - WebSocket integration for live data
- 🎯 **Advanced Filtering** - Filter stocks by price, RSI, market cap, volume
- 📊 **Technical Indicators** - RSI, SMA(20/50), MACD visualization
- ⚡ **Performance** - Optimized rendering and state management
- 📱 **Responsive Design** - Works on mobile, tablet, and desktop

## Getting Started

### Installation

\`\`\`bash
npm install
\`\`\`

### Development

\`\`\`bash
npm run dev
\`\`\`

The dev server runs at [http://localhost:3001](http://localhost:3001) and proxies `/api` and `/ws` to the backend on `:3333` (see `vite.config.ts`).

### Build for Production

\`\`\`bash
npm run build
\`\`\`

Output goes to `build/` (not Vite's default `dist/`) — the Dockerfile, `nginx.conf` and the compose healthcheck all point there.

### Tests

\`\`\`bash
npm test
\`\`\`

## Technologies

- **Vite 7** - Build tool and dev server
- **React 19** with TypeScript
- **Chakra UI** - Component library
- **Axios** - HTTP client
- **WebSocket** - Real-time updates
- **Vitest** + **@testing-library** - Tests (jsdom)
