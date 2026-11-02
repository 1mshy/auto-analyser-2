import { describe, expect, it } from 'vitest';
import {
  defaultWorkspace,
  moveWidget,
  parseWorkspace,
  updateLayout,
} from './model';

describe('workspace persistence boundary', () => {
  it('recovers from malformed, obsolete, and missing browser data', () => {
    for (const raw of [
      null,
      '{bad',
      '{}',
      'null',
      '42',
      JSON.stringify({ version: 0, layouts: [] }),
    ]) {
      expect(parseWorkspace(raw)).toEqual(defaultWorkspace());
    }
  });
  it('preserves intentional empty layouts and repairs unknown panels and widths', () => {
    const restored = parseWorkspace(
      JSON.stringify({
        version: 1,
        activeId: 'missing',
        layouts: [
          {
            id: 'custom',
            name: ' Focus ',
            widgets: [
              { id: 'sectors', width: 99 },
              { id: 'sectors', width: 8 },
              { id: 'unknown', width: 4 },
              { id: 'toString', width: 4 },
            ],
          },
          { id: 'blank', name: 'Blank', widgets: [] },
          { id: 'custom', name: 'Duplicate', widgets: [] },
          null,
        ],
      }),
    );
    expect(restored.activeId).toBe('custom');
    expect(restored.layouts).toEqual([
      { id: 'custom', name: 'Focus', widgets: [{ id: 'sectors', width: 6 }] },
      { id: 'blank', name: 'Blank', widgets: [] },
    ]);
  });
  it('keeps customized panels if the page closes during a blank rename', () => {
    const state = defaultWorkspace();
    state.layouts[0].name = '';
    state.layouts[0].widgets = [{ id: 'news', width: 12 }];
    const restored = parseWorkspace(JSON.stringify(state));
    expect(restored.layouts[0].name).toBe('My workspace');
    expect(restored.layouts[0].widgets).toEqual([{ id: 'news', width: 12 }]);
  });
  it('changes only the selected layout and never mutates presets or previous state', () => {
    const initial = defaultWorkspace();
    const updated = updateLayout(initial, (layout) => ({
      ...layout,
      widgets: moveWidget(layout.widgets, 'movers', -1),
    }));
    expect(updated.layouts[0].widgets[0].id).toBe('movers');
    expect(initial.layouts[0].widgets[0].id).toBe('sectors');
    expect(updated.layouts[1]).toBe(initial.layouts[1]);
    expect(defaultWorkspace()).toEqual(initial);
  });
  it('reordering never wraps a panel past a boundary', () => {
    const widgets = defaultWorkspace().layouts[0].widgets;
    expect(moveWidget(widgets, widgets[0].id, -1)).toBe(widgets);
    expect(moveWidget(widgets, widgets[widgets.length - 1].id, 1)).toBe(
      widgets,
    );
    expect(moveWidget(widgets, 'ai', 1)).toBe(widgets);
  });
});
