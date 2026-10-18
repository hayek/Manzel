const test = require('node:test');
const assert = require('node:assert/strict');

global.Projects = require('../js/projects.js');
const Expenses = require('../js/expenses.js');

const e = (type, price, notes) => ({ type, price, receipt: '', notes });

test('groups expenses by month, newest month first, with totals', () => {
  // Sheet order (oldest first)
  const groups = Expenses.groupByMonth([
    e('מנקה', -50, ' 25/9/26'),
    e('חשמל', -97.74, ' 4/9/26'),
    e('מנקה', -50, ' 2/10/26'),
    e('מנקה', -50, ' 9/10/26')
  ]);

  assert.deepEqual(groups.map(g => [g.year, g.month]), [[2026, 9], [2026, 8]]);
  assert.equal(groups[0].total, -100);
  assert.equal(groups[1].total, -147.74);
  assert.equal(groups[0].items.length, 2);
});

test('summarizes each month by type with counts and totals, biggest first', () => {
  const [october] = Expenses.groupByMonth([
    e('מנקה', -50, ' 2/10/26'),
    e('חשמל', -100, ' 5/10/26'),
    e('מנקה', -50, ' 9/10/26'),
    e('מנקה', -50, ' 16/10/26'),
    e('מנקה', -50, ' 23/10/26')
  ]);

  assert.deepEqual(october.types, [
    { type: 'מנקה', count: 4, total: -200 },
    { type: 'חשמל', count: 1, total: -100 }
  ]);
});

test('items inside a month are newest first', () => {
  const [october] = Expenses.groupByMonth([e('a', -1, ' 2/10/26'), e('b', -1, ' 23/10/26'), e('c', -1, ' 9/10/26')]);
  assert.deepEqual(october.items.map(i => i.type), ['b', 'c', 'a']);
});

test('undated rows join the month of the nearest dated row above them in the sheet', () => {
  const groups = Expenses.groupByMonth([
    e('מנקה', -50, ' 2/10/26'),
    e('תיקון', -300, ''),
    e('מנקה', -50, ' 6/11/26')
  ]);
  const october = groups.find(g => g.month === 9);
  assert.deepEqual(october.items.map(i => i.type).sort(), ['מנקה', 'תיקון']);
});

test('undated rows before any date join the first dated month', () => {
  const groups = Expenses.groupByMonth([e('שארית קופה 2022', 570, ''), e('חשמל', -109.43, ' 1/1/23')]);
  assert.equal(groups.length, 1);
  assert.deepEqual([groups[0].year, groups[0].month], [2023, 0]);
  assert.equal(groups[0].total, 460.57);
});

test('no dates at all gives a single undated group', () => {
  const groups = Expenses.groupByMonth([e('a', -1, ''), e('b', -2, 'note')]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].year, null);
  assert.equal(groups[0].total, -3);
});
