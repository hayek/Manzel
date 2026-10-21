const test = require('node:test');
const assert = require('node:assert/strict');
const Projects = require('../js/projects.js');

const PROJECT_COLS = ['id', 'name', 'description', 'per_apartment', 'total_cost', 'due_date', 'status'];
const PAYMENT_COLS = ['project_id', 'apartment', 'amount', 'date', 'method'];
// What gviz returns when a requested tab is missing: the first tab (Payments)
const PAYMENTS_TAB = {
  cols: ['חודש', 'אמיר', 'מונאיה', 'נימר 1', 'גבי', 'תמיר (גבי)', 'גוזף', 'נימר 2', 'לריסה', 'דינה', 'year'],
  rows: [[' ינו׳', 50, 50, 50, null, 50, 50, 50, 50, 50, 2026]]
};
const ROOF = ['roof-stairs-2026', 'זיפות גג + מדרגות', 'desc', 1700, 15340, '25/10/2026', 'open'];
const APTS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

function sameDay(date, y, m, d) {
  assert.ok(date instanceof Date, `expected a Date, got ${date}`);
  assert.deepEqual([date.getFullYear(), date.getMonth() + 1, date.getDate()], [y, m, d]);
}

test('hasHeaders matches trimmed, case-insensitive labels', () => {
  assert.equal(Projects.hasHeaders(['ID ', ' Name', 'description'], ['id', 'name']), true);
});

test('hasHeaders rejects the Payments tab gviz falls back to', () => {
  assert.equal(Projects.hasHeaders(PAYMENTS_TAB.cols, PROJECT_COLS), false);
});

test('parseProjects returns nothing when gviz fell back to the Payments tab', () => {
  assert.deepEqual(Projects.parseProjects(PAYMENTS_TAB), []);
});

test('parseProjects reads a valid project row', () => {
  const [project, ...rest] = Projects.parseProjects({ cols: PROJECT_COLS, rows: [ROOF, [null, 'no id', '', 1, 1, '', '']] });
  assert.equal(rest.length, 0);
  assert.equal(project.id, 'roof-stairs-2026');
  assert.equal(project.perApartment, 1700);
  assert.equal(project.totalCost, 15340);
  assert.equal(project.dueDate, '25/10/2026');
  assert.equal(project.status, 'open');
});

test('parseProjects treats anything but "done" as open', () => {
  const rows = [['a', 'A', '', 1, 1, '', 'Done'], ['b', 'B', '', 1, 1, '', ''], ['c', 'C', '', 1, 1, '', 'whatever']];
  assert.deepEqual(Projects.parseProjects({ cols: PROJECT_COLS, rows }).map(p => p.status), ['done', 'open', 'open']);
});

test('parsePayments returns nothing for an empty payments tab', () => {
  assert.deepEqual(Projects.parsePayments({ cols: PAYMENT_COLS, rows: [] }), []);
});

test('parsePayments returns nothing when gviz fell back to the Payments tab', () => {
  assert.deepEqual(Projects.parsePayments(PAYMENTS_TAB), []);
});

test('parsePayments maps payment methods, defaulting to cash', () => {
  const rows = [
    ['p', 1, 100, '', ''],
    ['p', 2, 100, '', 'Bit'],
    ['p', 3, 100, '', 'פייבוקס'],
    ['p', 4, 100, '', 'ביט'],
    ['p', 5, 100, '', 'paybox'],
    ['p', 6, 100, '', 'check']
  ];
  assert.deepEqual(
    Projects.parsePayments({ cols: PAYMENT_COLS, rows }).map(p => p.method),
    ['cash', 'bit', 'paybox', 'bit', 'paybox', 'cash']
  );
});

test('parsePayments skips rows without a project or a positive amount', () => {
  const rows = [[null, 1, 100, '', ''], ['p', 2, 0, '', ''], ['p', 3, null, '', ''], ['p', '4', '250', '1/11/2026', '']];
  const payments = Projects.parsePayments({ cols: PAYMENT_COLS, rows });
  assert.equal(payments.length, 1);
  assert.deepEqual(payments[0], { projectId: 'p', apartment: 4, amount: 250, date: '1/11/2026', method: 'cash' });
});

test('parseDate accepts dd/mm/yyyy, dd/mm/yy and gviz Date()', () => {
  sameDay(Projects.parseDate('25/10/2026'), 2026, 10, 25);
  sameDay(Projects.parseDate('25/10/26'), 2026, 10, 25);
  sameDay(Projects.parseDate('Date(2026,9,25)'), 2026, 10, 25);
});

test('parseDate returns null for empty or unparseable input', () => {
  assert.equal(Projects.parseDate(''), null);
  assert.equal(Projects.parseDate(null), null);
  assert.equal(Projects.parseDate('next week'), null);
});

test('summarize adds split payments, caps overpayment and ignores typos', () => {
  const [project] = Projects.parseProjects({ cols: PROJECT_COLS, rows: [ROOF] });
  const pay = (projectId, apartment, amount) => ({ projectId, apartment, amount, date: '', method: 'cash' });
  const payments = [
    pay('roof-stairs-2026', 3, 1000),
    pay('roof-stairs-2026', 3, 700),
    pay('roof-stairs-2026', 5, 1800),
    pay('roof-stairs-2026', 7, 500),
    pay('roof-stairs-2026', 12, 1700),
    pay('other', 1, 1700)
  ];
  const s = Projects.summarize(project, payments, APTS);

  assert.equal(s.goal, 15300);
  assert.equal(s.aptCount, 9);
  assert.equal(s.collected, 3900);
  assert.equal(s.paidCount, 2);
  assert.equal(s.apartments[3].status, 'paid');
  assert.equal(s.apartments[3].remaining, 0);
  assert.equal(s.apartments[3].payments.length, 2);
  assert.equal(s.apartments[5].status, 'paid');
  assert.equal(s.apartments[5].remaining, 0);
  assert.equal(s.apartments[7].status, 'partial');
  assert.equal(s.apartments[7].remaining, 1200);
  assert.equal(s.apartments[1].status, 'unpaid');
  assert.equal(s.apartments[1].remaining, 1700);
  assert.equal(s.apartments[12], undefined);
});

test('isOverdue only after the due day and while money is missing', () => {
  const [project] = Projects.parseProjects({ cols: PROJECT_COLS, rows: [ROOF] });
  const unpaid = Projects.summarize(project, [], APTS);
  const full = Projects.summarize(project, APTS.map(apartment => ({ projectId: project.id, apartment, amount: 1700 })), APTS);

  assert.equal(Projects.isOverdue(unpaid, new Date(2026, 9, 25, 23, 0)), false);
  assert.equal(Projects.isOverdue(unpaid, new Date(2026, 9, 26, 8, 0)), true);
  assert.equal(Projects.isOverdue(full, new Date(2026, 9, 26, 8, 0)), false);
});

test('isOverdue is false when there is no usable due date', () => {
  const [project] = Projects.parseProjects({ cols: PROJECT_COLS, rows: [['x', 'X', '', 100, 100, '', 'open']] });
  assert.equal(Projects.isOverdue(Projects.summarize(project, [], APTS), new Date(2030, 0, 1)), false);
});

test('amounts typed as text with commas or ₪ still count', () => {
  const [project] = Projects.parseProjects({ cols: PROJECT_COLS, rows: [['p', 'P', '', '1,700', '15,340 ₪', '', 'open']] });
  assert.equal(project.perApartment, 1700);
  assert.equal(project.totalCost, 15340);
  const [payment] = Projects.parsePayments({ cols: PAYMENT_COLS, rows: [['p', '3', '1,700 ₪', '', '']] });
  assert.equal(payment.amount, 1700);
});

test('projects without a usable per-apartment amount are skipped', () => {
  const rows = [['bad', 'Bad', '', 'abc', 0, '', 'open'], ['zero', 'Zero', '', 0, 0, '', 'open'], ROOF];
  assert.deepEqual(Projects.parseProjects({ cols: PROJECT_COLS, rows }).map(p => p.id), ['roof-stairs-2026']);
});

test('duplicate project ids keep only the first row', () => {
  const rows = [ROOF, ['roof-stairs-2026', 'Copy', '', 999, 0, '', 'open']];
  const projects = Projects.parseProjects({ cols: PROJECT_COLS, rows });
  assert.equal(projects.length, 1);
  assert.equal(projects[0].perApartment, 1700);
});

test('parseDate accepts dots, dashes and ISO dates', () => {
  sameDay(Projects.parseDate('25.10.2026'), 2026, 10, 25);
  sameDay(Projects.parseDate('25-10-2026'), 2026, 10, 25);
  sameDay(Projects.parseDate('2026-10-25'), 2026, 10, 25);
});

test('parseDate rejects impossible dates such as US-style 10/25/2026', () => {
  assert.equal(Projects.parseDate('10/25/2026'), null);
  assert.equal(Projects.parseDate('31/02/2026'), null);
  assert.equal(Projects.parseDate('2026-13-01'), null);
});

const EXPENSE_COLS = ['project_id', 'amount', 'date', 'description', 'receipt'];

test('parseProjectExpenses reads payouts and ignores the Payments fallback tab', () => {
  assert.deepEqual(Projects.parseProjectExpenses(PAYMENTS_TAB), []);
  const rows = [
    ['roof-stairs-2026', '5,000', '21/10/2026', 'תשלום לקבלן', ''],
    ['', 100, '', 'no project', ''],
    ['roof-stairs-2026', 0, '', 'zero', '']
  ];
  assert.deepEqual(Projects.parseProjectExpenses({ cols: EXPENSE_COLS, rows }), [
    { projectId: 'roof-stairs-2026', amount: 5000, date: '21/10/2026', description: 'תשלום לקבלן', receipt: '' }
  ]);
});

test('summarize adds paid out and balance from the project expenses', () => {
  const [project] = Projects.parseProjects({ cols: PROJECT_COLS, rows: [ROOF] });
  const payments = [{ projectId: project.id, apartment: 1, amount: 1700 }, { projectId: project.id, apartment: 2, amount: 1000 }];
  const expenses = [
    { projectId: project.id, amount: 1500, date: '20/10/2026', description: 'a', receipt: '' },
    { projectId: project.id, amount: 500, date: '21/10/2026', description: 'b', receipt: '' },
    { projectId: 'other', amount: 999, date: '', description: '', receipt: '' }
  ];
  const s = Projects.summarize(project, payments, APTS, expenses);
  assert.equal(s.collected, 2700);
  assert.equal(s.paidOut, 2000);
  assert.equal(s.balance, 700);
  assert.deepEqual(s.expenses.map(e => e.description), ['a', 'b']);
});

test('summarize without expenses has nothing paid out', () => {
  const [project] = Projects.parseProjects({ cols: PROJECT_COLS, rows: [ROOF] });
  const s = Projects.summarize(project, [], APTS);
  assert.equal(s.paidOut, 0);
  assert.equal(s.balance, 0);
  assert.deepEqual(s.expenses, []);
});
