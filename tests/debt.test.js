const test = require('node:test');
const assert = require('node:assert/strict');
global.Projects = require('../js/projects.js');
const Debt = require('../js/debt.js');

const COLS = ['apartment', 'name', 'moved_out', 'owes_from'];

// Build a year of payments from 12 amounts (undefined/null = empty cell)
function year(amounts) {
  return Array.from({ length: 12 }, (_, month) => {
    const amount = amounts[month];
    return { month, amount: amount === undefined ? null : amount };
  });
}

const PAID_YEAR = year(Array(12).fill(50));
// Apartment 5 for real: Nov 2025 empty; 2026 Jan-Jun paid, Jul-Nov empty
const APT5 = {
  2025: year([50, 50, 50, 50, 50, 50, 50, 50, 50, 50, null, 50]),
  2026: year([50, 50, 50, 50, 50, 50])
};
const NOV_22_2026 = new Date(2026, 10, 22);
const month = (y, m) => Debt.monthIndex(y, m);

test('parseMoveOuts reads rows, with or without owes_from, oldest first', () => {
  const moveOuts = Debt.parseMoveOuts({
    cols: COLS,
    rows: [
      [5, 'תמיר', '31/10/2026', '1/7/2026'],
      ['3', ' דנה ', 'Date(2025,1,1)', null]
    ]
  });
  assert.deepEqual(moveOuts, [
    { apartment: 3, name: 'דנה', to: month(2025, 1), from: null },
    { apartment: 5, name: 'תמיר', to: month(2026, 9), from: month(2026, 6) }
  ]);
});

test('parseMoveOuts works on a sheet without the owes_from column', () => {
  const [entry] = Debt.parseMoveOuts({ cols: COLS.slice(0, 3), rows: [[5, 'x', '31/10/2026']] });
  assert.equal(entry.from, null);
});

test('parseMoveOuts skips rows without an apartment or a readable date', () => {
  const moveOuts = Debt.parseMoveOuts({
    cols: COLS,
    rows: [[null, 'x', '31/10/2026'], [5, 'x', 'soon'], [5, 'x', null]]
  });
  assert.deepEqual(moveOuts, []);
});

test('parseMoveOuts returns nothing for a missing tab (gviz fell back to Payments)', () => {
  assert.deepEqual(Debt.parseMoveOuts({ cols: ['חודש', 'אמיר', 'year'], rows: [[' ינו׳', 50, 2026]] }), []);
  assert.deepEqual(Debt.parseMoveOuts(null), []);
});

test('previousRanges: each resident runs from the one before (or owes_from) to their move-out', () => {
  const ranges = Debt.previousRanges([
    { apartment: 5, name: 'a', to: month(2024, 3), from: null },
    { apartment: 5, name: 'b', to: month(2026, 9), from: null },
    { apartment: 5, name: 'c', to: month(2026, 10), from: month(2026, 10) },
    { apartment: 4, name: 'd', to: month(2026, 11), from: null }
  ], 5);
  assert.deepEqual(ranges, [
    { name: 'a', from: null, to: month(2024, 3) },
    { name: 'b', from: month(2024, 4), to: month(2026, 9) },
    { name: 'c', from: month(2026, 10), to: month(2026, 10) }
  ]);
});

test('previousRanges: owes_from never reaches back into the resident before', () => {
  const [, second] = Debt.previousRanges([
    { apartment: 5, name: 'a', to: month(2026, 3), from: null },
    { apartment: 5, name: 'b', to: month(2026, 9), from: month(2025, 0) }
  ], 5);
  assert.equal(second.from, month(2026, 4));
});

test('isPrevious tells whose month it is', () => {
  const ranges = [{ name: 'תמיר', from: month(2026, 6), to: month(2026, 9) }];
  assert.equal(Debt.isPrevious(ranges, 2026, 6), true);
  assert.equal(Debt.isPrevious(ranges, 2026, 9), true);
  assert.equal(Debt.isPrevious(ranges, 2026, 10), false);
  assert.equal(Debt.isPrevious(ranges, 2025, 10), false);
  assert.equal(Debt.isPrevious([], 2026, 7), false);
});

test('owedMonths counts empty and partial months, not discounts', () => {
  const months = Debt.owedMonths(year([50, null, 20, 0, 60]), 2026, 5);
  assert.deepEqual(months, [
    { year: 2026, month: 1, owed: 50, partial: false },
    { year: 2026, month: 2, owed: 30, partial: true }
  ]);
  assert.equal(Debt.total(months), 80);
});

test('owedMonths only keeps the months the filter accepts', () => {
  const months = Debt.owedMonths(year([]), 2026, 12, (y, m) => m >= 10);
  assert.deepEqual(months.map(m => m.month), [10, 11]);
});

test('owedMonths handles a missing year', () => {
  assert.equal(Debt.owedMonths(undefined, 2026, 3).length, 3);
});

test('apartment 5: Tamir owes Jul-Oct 2026, the new resident Nov 2025', () => {
  const moveOuts = [{ apartment: 5, name: 'תמיר', to: month(2026, 9), from: month(2026, 6) }];
  const ranges = Debt.previousRanges(moveOuts, 5);

  const [tamir, ...rest] = Debt.previousResidents(moveOuts, 5, APT5, NOV_22_2026);
  assert.equal(rest.length, 0);
  assert.equal(tamir.owed, 200);
  assert.deepEqual(tamir.months.map(m => m.month), [6, 7, 8, 9]);

  const current = Debt.owedMonths(APT5[2025], 2025, 12, (y, m) => !Debt.isPrevious(ranges, y, m));
  assert.deepEqual(current.map(m => [m.year, m.month]), [[2025, 10]]);
  assert.deepEqual(Debt.owedMonths(APT5[2026], 2026, 10, (y, m) => !Debt.isPrevious(ranges, y, m)), []);
});

test('without owes_from the previous resident owes everything up to the move-out', () => {
  const moveOuts = [{ apartment: 5, name: 'תמיר', to: month(2026, 9), from: null }];
  const [tamir] = Debt.previousResidents(moveOuts, 5, APT5, NOV_22_2026);
  assert.equal(tamir.owed, 250);
});

test('previousResidents splits months between two past residents, newest first', () => {
  const moveOuts = [
    { apartment: 5, name: 'first', to: month(2025, 11), from: null },
    { apartment: 5, name: 'second', to: month(2026, 2), from: null }
  ];
  const payments = { 2025: year([50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50]), 2026: year([]) };

  const residents = Debt.previousResidents(moveOuts, 5, payments, NOV_22_2026);

  assert.deepEqual(residents.map(r => [r.name, r.owed]), [['second', 150], ['first', 50]]);
});

test('previousResidents only looks at last year and this year, like the regular debt', () => {
  const moveOuts = [{ apartment: 5, name: 'old', to: month(2024, 5), from: null }];
  assert.deepEqual(Debt.previousResidents(moveOuts, 5, { 2024: year([]) }, NOV_22_2026), []);
});

test('previousResidents leaves out residents who owe nothing', () => {
  const moveOuts = [{ apartment: 5, name: 'paid up', to: month(2026, 5), from: month(2026, 0) }];
  assert.deepEqual(Debt.previousResidents(moveOuts, 5, { 2025: PAID_YEAR, ...APT5 }, NOV_22_2026), []);
});
