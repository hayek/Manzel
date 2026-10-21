const test = require('node:test');
const assert = require('node:assert/strict');
const Logic = require('../apps-script/Logic.gs');

const MIN = 60 * 1000;

// Payments tab shape: month cells are Dates that all carry year 2023; the real year is in the "year" column
const PAYMENTS = [
  ['חודש', 'אמיר', 'מונאיה', 'נימר 1', 'גבי', 'תמיר (גבי)', 'גוזף', 'נימר 2', 'לריסה', 'דינה', 'year'],
  [new Date(2023, 8, 1), 50, 50, '', '', '', 50, '', 50, '', 2026],
  [new Date(2023, 9, 1), 50, 50, '', 0, '', 50, '', 50, '', 2026],
  [new Date(2023, 8, 1), 50, 50, 50, 50, 50, 50, 50, 50, 50, 2025],
  [' אוק׳', 50, 50, 50, 50, 50, 50, 50, 50, 50, 2025]
];

function sameDay(date, y, m, d) {
  assert.ok(date instanceof Date, `expected a Date, got ${date}`);
  assert.deepEqual([date.getFullYear(), date.getMonth() + 1, date.getDate()], [y, m, d]);
}

test('monthIndexOf reads Date cells and Hebrew month text', () => {
  assert.equal(Logic.monthIndexOf(new Date(2023, 9, 1)), 9);
  assert.equal(Logic.monthIndexOf(' אוק׳'), 9);
  assert.equal(Logic.monthIndexOf(' ינו׳'), 0);
  assert.equal(Logic.monthIndexOf('x'), -1);
  assert.equal(Logic.monthIndexOf(''), -1);
});

test('findPaymentRow uses the year column, not the Date year', () => {
  assert.equal(Logic.findPaymentRow(PAYMENTS, 2026, 9), 2);
  assert.equal(Logic.findPaymentRow(PAYMENTS, 2025, 9), 4);
  assert.equal(Logic.findPaymentRow(PAYMENTS, 2027, 0), -1);
});

test('planMonthly writes empty cells and skips filled ones, including 0 discounts', () => {
  const plan = Logic.planMonthly(PAYMENTS, { apartment: 4, year: 2026, amounts: { 8: 50, 9: 50 } });
  assert.deepEqual(plan.writes, [{ row: 2, col: 5, value: 50 }]);
  assert.deepEqual(plan.written, [8]);
  assert.deepEqual(plan.skipped, [9]);
  assert.deepEqual(plan.missing, []);
});

test('planMonthly reports months whose row does not exist and writes nothing', () => {
  const plan = Logic.planMonthly(PAYMENTS, { apartment: 4, year: 2027, amounts: { 8: 50, 9: 50 } });
  assert.deepEqual(plan.writes, []);
  assert.deepEqual(plan.written, []);
  assert.deepEqual(plan.missing, [8, 9]);
});

test('planMonthly can write a 0 discount into an empty cell', () => {
  const plan = Logic.planMonthly(PAYMENTS, { apartment: 3, year: 2026, amounts: { 9: 0 } });
  assert.deepEqual(plan.writes, [{ row: 3, col: 4, value: 0 }]);
});

test('firstEmptyRow returns the first fully empty row after the header', () => {
  assert.equal(Logic.firstEmptyRow([['סוג', 'כמות'], ['מנקה', -50], ['חשמל', -90], ['', ''], [null, '']]), 4);
  assert.equal(Logic.firstEmptyRow([['h', 'x'], ['a', 1]]), 3);
  assert.equal(Logic.firstEmptyRow([['h', 'x']]), 2);
});

test('firstEmptyRow skips rows that have data in any column, even with an empty first cell', () => {
  assert.equal(Logic.firstEmptyRow([['h', 'x', 'y'], ['', -50, ''], ['', '', ''], ['a', 1, 2]]), 3);
  assert.equal(Logic.firstEmptyRow([['h', 'x'], ['  ', 5], ['', '']]), 3);
});

test('buildExpenseRow stores the amount negative and the date as a real date', () => {
  const row = Logic.buildExpenseRow({ type: 'מנקה', amount: 50, date: '2026-10-18' });
  assert.equal(row.length, 4);
  assert.deepEqual(row.slice(0, 3), ['מנקה', -50, '']);
  sameDay(row[3], 2026, 10, 18);
  assert.equal(Logic.buildExpenseRow({ type: 'x', amount: -20, date: '2026-10-18', receipt: 'https://r' })[1], -20);
  assert.equal(Logic.buildExpenseRow({ type: 'x', amount: 20, date: '2026-10-18', receipt: ' https://r ' })[2], 'https://r');
});

test('buildProjectRow writes the date as dd/mm/yyyy text and normalizes the method', () => {
  assert.deepEqual(
    Logic.buildProjectRow({ projectId: 'roof-stairs-2026', apartment: 3, amount: 1700, date: '2026-10-05', method: 'bit' }),
    ['roof-stairs-2026', 3, 1700, '05/10/2026', 'bit']
  );
  assert.equal(Logic.buildProjectRow({ projectId: 'p', apartment: 1, amount: 1, date: '2026-10-05', method: 'BIT' })[4], 'bit');
  assert.equal(Logic.buildProjectRow({ projectId: 'p', apartment: 1, amount: 1, date: '2026-10-05', method: 'check' })[4], 'cash');
});

test('validate rejects bad payloads and accepts good ones', () => {
  assert.equal(Logic.validate('monthly', { apartment: 4, year: 2026, amounts: { 9: 50 } }), null);
  assert.notEqual(Logic.validate('monthly', { apartment: 10, year: 2026, amounts: { 9: 50 } }), null);
  assert.notEqual(Logic.validate('monthly', { apartment: 4, year: 2026, amounts: { 12: 50 } }), null);
  assert.notEqual(Logic.validate('monthly', { apartment: 4, year: 2026, amounts: {} }), null);
  assert.notEqual(Logic.validate('monthly', { apartment: 4, year: 2026, amounts: { 9: -5 } }), null);
  assert.equal(Logic.validate('project', { projectId: 'p', apartment: 3, amount: 1700, date: '2026-10-20', method: 'cash' }), null);
  assert.notEqual(Logic.validate('project', { projectId: '', apartment: 3, amount: 1700, date: '2026-10-20' }), null);
  assert.notEqual(Logic.validate('project', { projectId: 'p', apartment: 3, amount: 0, date: '2026-10-20' }), null);
  assert.equal(Logic.validate('expense', { type: 'מנקה', amount: 50, date: '2026-10-18' }), null);
  assert.notEqual(Logic.validate('expense', { type: 'מנקה', amount: 50, date: '18/10/2026' }), null);
  assert.notEqual(Logic.validate('expense', { type: ' ', amount: 50, date: '2026-10-18' }), null);
  assert.notEqual(Logic.validate('nope', {}), null);
});

test('lockout: 5 wrong PINs lock for 10 minutes, then the lock doubles', () => {
  const t = 1_000_000;
  let state = null;
  for (let i = 0; i < 4; i++) state = Logic.afterFailure(state, t);
  assert.equal(Logic.lockState(state, t).locked, false);

  state = Logic.afterFailure(state, t);
  assert.deepEqual(Logic.lockState(state, t), { locked: true, retryAt: t + 10 * MIN });
  assert.equal(Logic.lockState(state, t + 10 * MIN).locked, false);

  const t2 = t + 11 * MIN;
  for (let i = 0; i < 5; i++) state = Logic.afterFailure(state, t2);
  assert.deepEqual(Logic.lockState(state, t2), { locked: true, retryAt: t2 + 20 * MIN });
});

test('lockout resets after a correct PIN and is capped at 24 hours', () => {
  assert.deepEqual(Logic.afterSuccess(), { fails: 0, round: 0, lockedUntil: 0 });
  let state = { fails: 4, round: 20, lockedUntil: 0 };
  state = Logic.afterFailure(state, 0);
  assert.equal(Logic.lockState(state, 0).retryAt, 24 * 60 * MIN);
});

test('timeZoneError blocks writes when the script and spreadsheet time zones differ', () => {
  assert.equal(Logic.timeZoneError('Asia/Jerusalem', 'Asia/Jerusalem'), null);
  assert.match(Logic.timeZoneError('Asia/Jerusalem', 'America/New_York'), /time zone/i);
});

test('text that a sheet would read as a formula is stored as plain text', () => {
  assert.equal(Logic.buildExpenseRow({ type: '=HYPERLINK("x")', amount: 5, date: '2026-10-18' })[0], "'=HYPERLINK(\"x\")");
  assert.equal(Logic.buildExpenseRow({ type: '+972', amount: 5, date: '2026-10-18' })[0], "'+972");
  assert.equal(Logic.buildExpenseRow({ type: 'מנקה', amount: 5, date: '2026-10-18', receipt: '@x' })[2], "'@x");
  assert.equal(Logic.buildExpenseRow({ type: 'מנקה', amount: 5, date: '2026-10-18' })[0], 'מנקה');
  assert.equal(Logic.buildProjectRow({ projectId: '-p', apartment: 1, amount: 1, date: '2026-10-05', method: 'cash' })[0], "'-p");
});

test('requestCacheKey accepts client request ids and rejects junk', () => {
  assert.equal(Logic.requestCacheKey('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'), 'req:a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d');
  assert.equal(Logic.requestCacheKey(undefined), null);
  assert.equal(Logic.requestCacheKey('short'), null);
  assert.equal(Logic.requestCacheKey('bad id with spaces!!'), null);
});

const PDF = { name: 'bill.pdf', mimeType: 'application/pdf', data: 'JVBERi0xLjQ=' };
const JPEG = { name: 'IMG_1.jpg', mimeType: 'image/jpeg', data: '/9j/4AAQ' };

test('receiptFileName is date, type and amount with the right extension', () => {
  assert.equal(Logic.receiptFileName({ type: 'חשמל', amount: 97.74, date: '2026-10-19' }, JPEG), '2026-10-19 חשמל 97.74.jpg');
  assert.equal(Logic.receiptFileName({ type: 'חשמל', amount: 97.74, date: '2026-10-19' }, PDF), '2026-10-19 חשמל 97.74.pdf');
  assert.equal(Logic.receiptFileName({ type: 'a/b\\c', amount: 5, date: '2026-10-19' }, { mimeType: 'image/png' }), '2026-10-19 a-b-c 5.png');
});

test('validate accepts an expense with a photo or PDF receipt', () => {
  const base = { type: 'חשמל', amount: 97.74, date: '2026-10-19' };
  assert.equal(Logic.validate('expense', { ...base, receiptFile: JPEG }), null);
  assert.equal(Logic.validate('expense', { ...base, receiptFile: PDF }), null);
});

test('validate rejects receipts of other types, empty, or over 10 MB', () => {
  const base = { type: 'חשמל', amount: 97.74, date: '2026-10-19' };
  assert.notEqual(Logic.validate('expense', { ...base, receiptFile: { mimeType: 'text/html', data: 'PGh0bWw+' } }), null);
  assert.notEqual(Logic.validate('expense', { ...base, receiptFile: { mimeType: 'image/jpeg', data: '' } }), null);
  assert.notEqual(Logic.validate('expense', { ...base, receiptFile: { mimeType: 'image/jpeg', data: 'A'.repeat(14 * 1024 * 1024) } }), null);
  assert.notEqual(Logic.validate('expense', { ...base, receiptFile: { mimeType: 'image/jpeg', data: 'not base64!' } }), null);
});

test('buildProjectExpenseRow writes the date as text and keeps text plain', () => {
  assert.deepEqual(
    Logic.buildProjectExpenseRow({ projectId: 'roof-stairs-2026', amount: 5000, date: '2026-10-21', type: 'תשלום לקבלן' }, 'https://drive/x'),
    ['roof-stairs-2026', 5000, '21/10/2026', 'תשלום לקבלן', 'https://drive/x']
  );
  assert.equal(Logic.buildProjectExpenseRow({ projectId: 'p', amount: 1, date: '2026-10-21', type: '=X' }, '')[3], "'=X");
});

test('validate checks project expenses like expenses, plus the project', () => {
  const base = { projectId: 'roof-stairs-2026', type: 'תשלום לקבלן', amount: 5000, date: '2026-10-21' };
  assert.equal(Logic.validate('projectExpense', base), null);
  assert.equal(Logic.validate('projectExpense', { ...base, receiptFile: JPEG }), null);
  assert.notEqual(Logic.validate('projectExpense', { ...base, projectId: '' }), null);
  assert.notEqual(Logic.validate('projectExpense', { ...base, amount: 0 }), null);
  assert.notEqual(Logic.validate('projectExpense', { ...base, receiptFile: { mimeType: 'text/html', data: 'eA==' } }), null);
});
