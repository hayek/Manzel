const test = require('node:test');
const assert = require('node:assert/strict');
global.Projects = require('../js/projects.js');
const Debt = require('../js/debt.js');

const COLS = ['apartment', 'name', 'moved_out'];

// Build a year of payments from 12 amounts (undefined/null = empty cell)
function year(amounts) {
  return Array.from({ length: 12 }, (_, month) => {
    const amount = amounts[month];
    return { month, amount: amount === undefined ? null : amount };
  });
}

// Apartment 5 in Nov 2026: Jan-Jun paid, Jul-Nov empty
const APT5_2026 = year([50, 50, 50, 50, 50, 50]);
const NOV_22_2026 = new Date(2026, 10, 22);

test('parseMoveOuts reads rows and sorts them by month', () => {
  const moveOuts = Debt.parseMoveOuts({
    cols: COLS,
    rows: [
      [5, 'תמיר', '31/10/2026'],
      ['3', ' דנה ', 'Date(2025,1,1)']
    ]
  });
  assert.deepEqual(moveOuts, [
    { apartment: 3, name: 'דנה', year: 2025, month: 1 },
    { apartment: 5, name: 'תמיר', year: 2026, month: 9 }
  ]);
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

test('residentStart is the month after the apartment\'s latest move-out', () => {
  const moveOuts = [
    { apartment: 5, name: 'a', year: 2024, month: 3 },
    { apartment: 5, name: 'b', year: 2026, month: 9 },
    { apartment: 4, name: 'c', year: 2026, month: 11 }
  ];
  assert.deepEqual(Debt.residentStart(moveOuts, 5), { year: 2026, month: 10 });
  assert.deepEqual(Debt.residentStart(moveOuts, 4), { year: 2027, month: 0 });
  assert.equal(Debt.residentStart(moveOuts, 1), null);
});

test('owedMonths counts empty and partial months, not discounts', () => {
  const months = Debt.owedMonths(year([50, null, 20, 0, 60]), 2026, 5, null);
  assert.deepEqual(months, [
    { year: 2026, month: 1, owed: 50, partial: false },
    { year: 2026, month: 2, owed: 30, partial: true }
  ]);
  assert.equal(Debt.total(months), 80);
});

test('owedMonths skips months before the resident moved in', () => {
  const start = { year: 2026, month: 10 };
  assert.deepEqual(Debt.owedMonths(APT5_2026, 2026, 10, start), []);
  assert.deepEqual(Debt.owedMonths(APT5_2026, 2026, 11, start), [
    { year: 2026, month: 10, owed: 50, partial: false }
  ]);
  // A whole earlier year belongs to the previous resident
  assert.deepEqual(Debt.owedMonths(year([]), 2025, 12, start), []);
});

test('owedMonths handles a missing year', () => {
  assert.equal(Debt.owedMonths(undefined, 2026, 3, null).length, 3);
});

test('previousResidents gives each past resident their own unpaid months', () => {
  const moveOuts = [{ apartment: 5, name: 'תמיר', year: 2026, month: 9 }];
  const payments = { 2026: APT5_2026, 2025: year([50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50]) };

  const [tamir, ...rest] = Debt.previousResidents(moveOuts, 5, payments, NOV_22_2026);

  assert.equal(rest.length, 0);
  assert.equal(tamir.name, 'תמיר');
  assert.equal(tamir.owed, 200);
  assert.deepEqual(tamir.months.map(m => m.month), [6, 7, 8, 9]);
});

test('previousResidents splits months between two past residents', () => {
  const moveOuts = [
    { apartment: 5, name: 'first', year: 2025, month: 11 },
    { apartment: 5, name: 'second', year: 2026, month: 2 }
  ];
  const payments = { 2025: year([50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50]), 2026: year([]) };

  const residents = Debt.previousResidents(moveOuts, 5, payments, NOV_22_2026);

  assert.deepEqual(residents.map(r => [r.name, r.owed]), [['second', 150], ['first', 50]]);
});

test('previousResidents only looks at last year and this year, like the regular debt', () => {
  const moveOuts = [{ apartment: 5, name: 'old', year: 2024, month: 5 }];
  assert.deepEqual(Debt.previousResidents(moveOuts, 5, { 2024: year([]) }, NOV_22_2026), []);
});

test('previousResidents leaves out residents who owe nothing', () => {
  const moveOuts = [{ apartment: 5, name: 'paid up', year: 2026, month: 5 }];
  assert.deepEqual(Debt.previousResidents(moveOuts, 5, { 2026: APT5_2026, 2025: year([50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 50]) }, NOV_22_2026), []);
});
