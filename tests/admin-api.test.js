const test = require('node:test');
const assert = require('node:assert/strict');

function fakeStorage() {
  const store = {};
  return {
    getItem: key => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: key => { delete store[key]; }
  };
}

global.sessionStorage = fakeStorage();
global.localStorage = fakeStorage();
global.Projects = require('../js/projects.js');
global.SheetsAPI = require('../js/api.js');
const AdminAPI = require('../js/admin-api.js');

let requests = [];
function respondWith(body) {
  requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url, options });
    return { json: async () => body };
  };
}

test.beforeEach(() => {
  AdminAPI.logout();
  sessionStorage.removeItem('manzel_data_v7');
});

test('login with a wrong PIN stores nothing', async () => {
  respondWith({ ok: false, error: 'bad_pin' });
  const result = await AdminAPI.login('9999');
  assert.equal(result.error, 'bad_pin');
  assert.equal(AdminAPI.isLoggedIn(), false);
  assert.equal(localStorage.getItem('manzel_admin'), null);
});

test('login with the right PIN turns admin mode on', async () => {
  respondWith({ ok: true });
  await AdminAPI.login('4321');
  assert.equal(AdminAPI.isLoggedIn(), true);
  assert.equal(localStorage.getItem('manzel_admin'), 'true');
  assert.deepEqual(JSON.parse(requests[0].options.body), { pin: '4321', action: 'verify' });
});

test('call posts the stored PIN and payload with no custom headers', async () => {
  respondWith({ ok: true });
  await AdminAPI.login('4321');
  respondWith({ ok: true });
  await AdminAPI.call('expense', { type: 'מנקה', amount: 50, date: '2026-10-18' });

  const { url, options } = requests[0];
  assert.equal(url, AdminAPI.ENDPOINT);
  assert.equal(options.method, 'POST');
  assert.equal(options.headers, undefined);
  assert.deepEqual(JSON.parse(options.body), { type: 'מנקה', amount: 50, date: '2026-10-18', pin: '4321', action: 'expense' });
});

test('call sends the request id so a retry is not saved twice', async () => {
  respondWith({ ok: true });
  await AdminAPI.call('expense', { type: 'x' }, 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d');
  assert.equal(JSON.parse(requests[0].options.body).requestId, 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d');
});

test('a successful call clears the public data cache; a failed one does not', async () => {
  sessionStorage.setItem('manzel_data_v7', 'cached');
  respondWith({ ok: false, error: 'invalid' });
  await AdminAPI.call('expense', {});
  assert.equal(sessionStorage.getItem('manzel_data_v7'), 'cached');

  respondWith({ ok: true });
  await AdminAPI.call('expense', {});
  assert.equal(sessionStorage.getItem('manzel_data_v7'), null);
});

test('a network failure comes back as an error result', async () => {
  global.fetch = async () => { throw new Error('offline'); };
  const result = await AdminAPI.call('expense', {});
  assert.equal(result.ok, false);
  assert.equal(result.error, 'network');
});

test('logout turns admin mode off', async () => {
  respondWith({ ok: true });
  await AdminAPI.login('4321');
  AdminAPI.logout();
  assert.equal(AdminAPI.isLoggedIn(), false);
  assert.equal(localStorage.getItem('manzel_admin'), null);
});
