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

test('loads projects and payments when the tabs exist', async () => {
  const requested = installFetch({
    ...BASE_TABS,
    Projects: table(Projects.PROJECT_HEADERS, [['roof-stairs-2026', 'זיפות גג + מדרגות', '', 1700, 15340, '25/10/2026', 'open']]),
    ProjectPayments: table(Projects.PAYMENT_HEADERS, [['roof-stairs-2026', 3, 1700, '20/10/2026', 'bit']])
  });

  const data = await SheetsAPI.fetchAllData(true);

  assert.equal(data.projects.length, 1);
  assert.equal(data.projects[0].perApartment, 1700);
  assert.equal(data.projectPayments.length, 1);
  assert.equal(data.projectPayments[0].method, 'bit');
  assert.equal(data.total, 601.1);
  assert.equal(requested.find(r => r.sheet === 'Projects').headers, '1');
  assert.equal(requested.find(r => r.sheet === 'ProjectPayments').headers, '1');
  assert.equal(requested.some(r => r.sheet === 'Announcement'), false);
  assert.equal(requested.find(r => r.sheet === 'ProjectExpenses').headers, '1');
  assert.equal('announcement' in data, false);
});

test('missing tabs (gviz falls back to Payments) give empty project data', async () => {
  installFetch(BASE_TABS);

  const data = await SheetsAPI.fetchAllData(true);

  assert.deepEqual(data.projects, []);
  assert.deepEqual(data.projectPayments, []);
  assert.equal(data.total, 601.1);
});

test('a failing optional tab does not break the page data', async () => {
  installFetch(BASE_TABS, { failing: ['Projects', 'ProjectPayments'] });

  const data = await SheetsAPI.fetchAllData(true);

  assert.deepEqual(data.projects, []);
  assert.deepEqual(data.projectPayments, []);
  assert.deepEqual(data.building.map(f => f.apartments), [[2, 3], [1]]);
});

test('getResidentData lists open projects and any project the apartment still owes', async () => {
  installFetch({
    ...BASE_TABS,
    Projects: table(Projects.PROJECT_HEADERS, [
      ['roof', 'Roof', '', 1700, 15340, '25/10/2026', 'open'],
      ['old-paid', 'Old paid', '', 100, 300, '', 'done'],
      ['old-owed', 'Old owed', '', 200, 600, '', 'done']
    ]),
    ProjectPayments: table(Projects.PAYMENT_HEADERS, [
      ['roof', 1, 1000, '20/10/2026', 'bit'],
      ['old-paid', 1, 100, '', ''],
      ['old-owed', 2, 200, '', '']
    ])
  });
  await SheetsAPI.fetchAllData(true);

  const resident = await SheetsAPI.getResidentData('אמיר');

  assert.deepEqual(resident.projects.map(p => p.project.id), ['roof', 'old-owed']);
  const [roof, oldOwed] = resident.projects;
  assert.equal(roof.status, 'partial');
  assert.equal(roof.paid, 1000);
  assert.equal(roof.remaining, 700);
  assert.equal(roof.payments[0].method, 'bit');
  assert.equal(oldOwed.status, 'unpaid');
  assert.equal(oldOwed.remaining, 200);
});

test('loads project expenses, and a missing tab gives none', async () => {
  installFetch({
    ...BASE_TABS,
    ProjectExpenses: table(Projects.EXPENSE_HEADERS, [['roof-stairs-2026', 5000, '21/10/2026', 'תשלום לקבלן', '']])
  });
  const data = await SheetsAPI.fetchAllData(true);
  assert.equal(data.projectExpenses.length, 1);
  assert.equal(data.projectExpenses[0].amount, 5000);

  installFetch(BASE_TABS);
  assert.deepEqual((await SheetsAPI.fetchAllData(true)).projectExpenses, []);
});
