export const WORKSPACE_KEY = 'auto-analyser.workspace.v1';
export const widgetCatalog = {
  sectors: {
    title: 'Sector performance',
    description: 'Compare daily returns across analyzed sectors.',
  },
  movers: {
    title: 'Market movers',
    description: 'Daily gainers and decliners from your stock universe.',
  },
  oversold: {
    title: 'Oversold radar',
    description: 'Stocks with the lowest available RSI readings.',
  },
  megacap: {
    title: 'Mega-cap focus',
    description: 'A shortlist of the largest companies.',
  },
  watchlists: {
    title: 'Your watchlists',
    description: 'Jump into the companies you follow.',
  },
  news: {
    title: 'Latest headlines',
    description: 'The latest news from the market feed.',
  },
  ai: {
    title: 'AI research',
    description: 'On-demand analysis of oversold stocks, when enabled.',
  },
} as const;
export type WidgetId = keyof typeof widgetCatalog;
export type WidgetWidth = 4 | 6 | 8 | 12;
export interface Widget {
  id: WidgetId;
  width: WidgetWidth;
}
export interface WorkspaceLayout {
  id: string;
  name: string;
  widgets: Widget[];
}
export interface WorkspaceState {
  version: 1;
  activeId: string;
  layouts: WorkspaceLayout[];
}
export const presets: Record<string, { name: string; widgets: Widget[] }> = {
  overview: {
    name: 'Market overview',
    widgets: [
      { id: 'sectors', width: 8 },
      { id: 'movers', width: 4 },
      { id: 'oversold', width: 4 },
      { id: 'megacap', width: 4 },
      { id: 'watchlists', width: 4 },
    ],
  },
  discovery: {
    name: 'Find opportunities',
    widgets: [
      { id: 'oversold', width: 6 },
      { id: 'movers', width: 6 },
      { id: 'sectors', width: 8 },
      { id: 'news', width: 4 },
    ],
  },
  monitor: {
    name: 'Daily monitor',
    widgets: [
      { id: 'watchlists', width: 4 },
      { id: 'news', width: 8 },
      { id: 'megacap', width: 6 },
      { id: 'movers', width: 6 },
    ],
  },
};
export function defaultWorkspace(): WorkspaceState {
  return {
    version: 1,
    activeId: 'overview',
    layouts: Object.entries(presets).map(([id, preset]) => ({
      id,
      name: preset.name,
      widgets: preset.widgets.map((widget) => ({ ...widget })),
    })),
  };
}

/** Stored browser preferences are untrusted and may come from an older build. */
export function parseWorkspace(raw: string | null): WorkspaceState {
  try {
    const data: unknown = JSON.parse(raw ?? 'null');
    if (!data || typeof data !== 'object') return defaultWorkspace();
    const stored = data as Partial<WorkspaceState>;
    if (stored.version !== 1 || !Array.isArray(stored.layouts))
      return defaultWorkspace();
    const ids = new Set<string>();
    const layouts = stored.layouts.slice(0, 8).flatMap((layout) => {
      if (
        !layout ||
        typeof layout.id !== 'string' ||
        !layout.id ||
        layout.id.length > 100 ||
        ids.has(layout.id) ||
        typeof layout.name !== 'string' ||
        !Array.isArray(layout.widgets)
      )
        return [];
      ids.add(layout.id);
      const seen = new Set<WidgetId>();
      const widgets: Widget[] = [];
      for (const widget of layout.widgets) {
        if (
          !widget ||
          !Object.prototype.hasOwnProperty.call(widgetCatalog, widget.id) ||
          seen.has(widget.id)
        )
          continue;
        seen.add(widget.id);
        widgets.push({
          id: widget.id,
          width: [4, 6, 8, 12].includes(widget.width) ? widget.width : 6,
        });
      }
      return [
        {
          id: layout.id.slice(0, 100),
          name: layout.name.trim().slice(0, 40) || 'My workspace',
          widgets,
        },
      ];
    });
    if (!layouts.length) return defaultWorkspace();
    return {
      version: 1,
      activeId: layouts.some((layout) => layout.id === stored.activeId)
        ? stored.activeId!
        : layouts[0].id,
      layouts,
    };
  } catch {
    return defaultWorkspace();
  }
}
export function updateLayout(
  state: WorkspaceState,
  update: (layout: WorkspaceLayout) => WorkspaceLayout,
): WorkspaceState {
  return {
    ...state,
    layouts: state.layouts.map((layout) =>
      layout.id === state.activeId ? update(layout) : layout,
    ),
  };
}
export function moveWidget(
  widgets: Widget[],
  id: WidgetId,
  direction: -1 | 1,
): Widget[] {
  const index = widgets.findIndex((widget) => widget.id === id);
  const destination = index + direction;
  if (index < 0 || destination < 0 || destination >= widgets.length)
    return widgets;
  const result = [...widgets];
  [result[index], result[destination]] = [result[destination], result[index]];
  return result;
}
