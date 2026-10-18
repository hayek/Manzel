const test = require('node:test');
const assert = require('node:assert/strict');

global.Projects = require('../js/projects.js');
const SheetsAPI = require('../js/api.js');

function table(cols, rows) {
  return {
    cols: cols.map(label => ({ label })),
    rows: rows.map(row => ({ c: row.map(v => (v === null ? null : { v })) }))
  };
}

const PAYMENTS = table(['חודש', 'אמיר', 'year'], [[' ינו׳', 50, 2026]]);
const BASE_TABS = {
  Payments: PAYMENTS,
  total: table(['total'], [[601.1]]),
  Expence: table(['סוג', 'כמות', 'קבלה', 'הערות'], [['מנקה', -50, '', ' 2/10/26']]),
  building: table(['', ''], [[2, 3], [1, null]]),
  Residents: table(['', '', '', '', ''], [[1, 'חאיק', 'אמיר', '', '050']])
};

// Fake gviz: unknown tab names fall back to the first tab, like Google does
function installFetch(tabs, { failing = [] } = {}) {
  const requested = [];
  global.fetch = async url => {
    const params = new URL(url).searchParams;
    const sheet = params.get('sheet');
    requested.push({ sheet, headers: params.get('headers') });
    if (failing.includes(sheet)) throw new Error('network down');
    const data = tabs[sheet] || tabs.Payments;
    return {
      ok: true,
      text: async () => `google.visualization.Query.setResponse(${JSON.stringify({ status: 'ok', table: data })});`
    };
  };
  return requested;
}

test.beforeEach(() => {
  const store = {};
  global.sessionStorage = {
    getItem: key => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = value; }
  };
});

test('loads projects, payments and announcement when the tabs exist', async () => {
  const requested = installFetch({
    ...BASE_TABS,
    Projects: table(Projects.PROJECT_HEADERS, [['roof-stairs-2026', 'זיפות גג + מדרגות', '', 1700, 15340, '25/10/2026', 'open']]),
    ProjectPayments: table(Projects.PAYMENT_HEADERS, [['roof-stairs-2026', 3, 1700, '20/10/2026', 'bit']]),
    Announcement: table([''], [['שנה טובה ומוצלחת'], ['https://go.glideapps.com/app/x']])
  });

  const data = await SheetsAPI.fetchAllData(true);

  assert.equal(data.projects.length, 1);
  assert.equal(data.projects[0].perApartment, 1700);
  assert.equal(data.projectPayments.length, 1);
  assert.equal(data.projectPayments[0].method, 'bit');
  assert.equal(data.announcement, 'שנה טובה ומוצלחת');
  assert.equal(data.total, 601.1);
  assert.equal(requested.find(r => r.sheet === 'Projects').headers, '1');
  assert.equal(requested.find(r => r.sheet === 'ProjectPayments').headers, '1');
  assert.equal(requested.find(r => r.sheet === 'Announcement').headers, '0');
});

test('missing tabs (gviz falls back to Payments) give empty project data and no announcement', async () => {
  installFetch(BASE_TABS);

  const data = await SheetsAPI.fetchAllData(true);

  assert.deepEqual(data.projects, []);
  assert.deepEqual(data.projectPayments, []);
  assert.equal(data.announcement, '');
  assert.equal(data.total, 601.1);
});

test('a failing optional tab does not break the page data', async () => {
  installFetch(BASE_TABS, { failing: ['Projects', 'ProjectPayments', 'Announcement'] });

  const data = await SheetsAPI.fetchAllData(true);

  assert.deepEqual(data.projects, []);
  assert.deepEqual(data.projectPayments, []);
  assert.equal(data.announcement, '');
  assert.deepEqual(data.building.map(f => f.apartments), [[2, 3], [1]]);
});

test('announcement skips a leading link and is empty for a blank tab', async () => {
  installFetch({ ...BASE_TABS, Announcement: table([''], [[null], ['https://x.y']]) });
  assert.equal((await SheetsAPI.fetchAllData(true)).announcement, '');
});
