import { vi } from 'vitest';

vi.mock('axios', () => {
  // api.ts does `import axios from 'axios'`, so under ESM the mock must expose
  // a `default` as well as the named shape.
  const mock = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };
  return { ...mock, default: mock };
});

import { api } from './api';

test('uses same-origin websocket by default', () => {
  expect(api.getWebSocketUrl()).toMatch(/^ws:\/\/localhost(:\d+)?\/ws$/);
});
