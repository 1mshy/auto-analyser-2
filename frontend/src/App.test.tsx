jest.mock('axios', () => ({
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
}));

import { api } from './api';

test('uses same-origin websocket by default', () => {
  expect(api.getWebSocketUrl()).toMatch(/^ws:\/\/localhost(:\d+)?\/ws$/);
});
