import {
  LayoutDashboard,
  ListFilter,
  ScanLine,
  TrendingUp,
  Layers3,
  Newspaper,
  ChartNoAxesCombined,
  FlaskConical,
  Bell,
  MessageSquareText,
} from 'lucide-react';

/** One navigation model for the desktop rail, mobile drawer, and page context. */
export const navigation = [
  {
    label: 'Workspace',
    items: [
      { to: '/', label: 'Overview', icon: LayoutDashboard },
      { to: '/stocks', label: 'All stocks', icon: ListFilter },
      { to: '/screener', label: 'Screener', icon: ScanLine },
      { to: '/opportunities', label: 'Opportunities', icon: TrendingUp },
    ],
  },
  {
    label: 'Research',
    items: [
      { to: '/research', label: 'AI research', icon: MessageSquareText },
      {
        to: '/sectors',
        label: 'Sector performance',
        icon: ChartNoAxesCombined,
      },
      { to: '/funds', label: 'Funds & indexes', icon: Layers3 },
      { to: '/news', label: 'Market news', icon: Newspaper },
      { to: '/backtest', label: 'Strategy lab', icon: FlaskConical },
    ],
  },
  {
    label: 'Monitor',
    items: [{ to: '/alerts', label: 'Watchlists & alerts', icon: Bell }],
  },
];

export function isNavigationActive(path: string, to: string) {
  return to === '/' ? path === '/' : path === to || path.startsWith(`${to}/`);
}
