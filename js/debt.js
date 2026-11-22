/**
 * Monthly Debt
 * Works out which monthly payments are owed, and by whom when residents moved out.
 * Pure functions only - shared by the dashboard and resident pages.
 *
 * MoveOuts sheet (optional): apartment | name | moved_out
 * moved_out is any date in the old resident's LAST month. Earlier unpaid months are
 * theirs; the current resident only owes from the month after.
 */

const Debt = (function() {
  const MONTHLY_AMOUNT = 50;
  const MOVE_OUT_HEADERS = ['apartment', 'name', 'moved_out'];

  /** Months since year 0, so two months compare with < and > */
  function monthIndex(year, month) {
    return year * 12 + month;
  }

  /**
   * Parse the MoveOuts sheet
   * @param {Object|null} raw - Parsed sheet { cols, rows }, or null if it failed to load
   * @returns {Array} [{ apartment, name, year, month }] oldest first
   */
  function parseMoveOuts(raw) {
    if (!raw || !Projects.hasHeaders(raw.cols, MOVE_OUT_HEADERS)) return [];

    return raw.rows
      .map(row => {
        const date = Projects.parseDate(row[2]);
        return {
          apartment: Number(row[0]),
          name: row[1] ? String(row[1]).trim() : '',
          year: date ? date.getFullYear() : null,
          month: date ? date.getMonth() : null
        };
      })
      .filter(entry => entry.apartment > 0 && entry.year !== null)
      .sort((a, b) => monthIndex(a.year, a.month) - monthIndex(b.year, b.month));
  }

  /**
   * First month the current resident of an apartment pays for
   * @param {Array} moveOuts - From parseMoveOuts
   * @param {number|string} apartment - Apartment number
   * @returns {Object|null} { year, month }, or null if nobody moved out
   */
  function residentStart(moveOuts, apartment) {
    const own = moveOuts.filter(entry => entry.apartment === Number(apartment));
    if (own.length === 0) return null;
    const last = own[own.length - 1];
    const next = monthIndex(last.year, last.month) + 1;
    return { year: Math.floor(next / 12), month: next % 12 };
  }

  /**
   * Unpaid months of one year, from `start` on
   * 0 means discount (paid yearly), so it is not debt.
   * @param {Array} yearPayments - 12 entries { amount } (or missing)
   * @param {number} year - The year these payments are for
   * @param {number} monthLimit - Check months 0..monthLimit-1
   * @param {Object|null} start - Skip months before { year, month }
   * @param {Object|null} [end] - Skip months after { year, month }
   * @returns {Array} [{ year, month, owed, partial }]
   */
  function owedMonths(yearPayments, year, monthLimit, start, end) {
    const months = [];
    for (let month = 0; month < monthLimit; month++) {
      const index = monthIndex(year, month);
      if (start && index < monthIndex(start.year, start.month)) continue;
      if (end && index > monthIndex(end.year, end.month)) continue;

      const payment = (yearPayments || [])[month];
      if (!payment || payment.amount === null) {
        months.push({ year, month, owed: MONTHLY_AMOUNT, partial: false });
      } else if (payment.amount > 0 && payment.amount < MONTHLY_AMOUNT) {
        months.push({ year, month, owed: MONTHLY_AMOUNT - payment.amount, partial: true });
      }
    }
    return months;
  }

  /**
   * Sum what a list of owed months adds up to
   * @param {Array} months - From owedMonths
   * @returns {number} Total in ₪
   */
  function total(months) {
    return months.reduce((sum, entry) => sum + entry.owed, 0);
  }

  /**
   * Past residents of an apartment who still owe monthly payments
   * Looks at last year and this year (up to last month), like the regular debt.
   * @param {Array} moveOuts - From parseMoveOuts
   * @param {number|string} apartment - Apartment number
   * @param {Object} payments - The apartment's payments { year: [12 months] }
   * @param {Date} now - Today
   * @returns {Array} [{ name, months, owed }] most recent first
   */
  function previousResidents(moveOuts, apartment, payments, now) {
    const currentYear = now.getFullYear();
    const own = moveOuts.filter(entry => entry.apartment === Number(apartment));

    return own
      .map((entry, i) => {
        const before = own[i - 1];
        const start = before ? residentStart([before], apartment) : null;
        const end = { year: entry.year, month: entry.month };
        const months = [
          ...owedMonths(payments[currentYear - 1], currentYear - 1, 12, start, end),
          ...owedMonths(payments[currentYear], currentYear, now.getMonth(), start, end)
        ];
        return { name: entry.name, months, owed: total(months) };
      })
      .filter(resident => resident.owed > 0)
      .reverse();
  }

  return {
    MONTHLY_AMOUNT,
    MOVE_OUT_HEADERS,
    parseMoveOuts,
    residentStart,
    owedMonths,
    total,
    previousResidents
  };
})();

if (typeof module !== 'undefined') {
  module.exports = Debt;
}
