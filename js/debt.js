/**
 * Monthly Debt
 * Works out which monthly payments are owed, and by whom when residents moved out.
 * Pure functions only - shared by the dashboard and resident pages.
 *
 * MoveOuts sheet (optional): apartment | name | moved_out | owes_from
 * - moved_out: any date in the old resident's LAST month.
 * - owes_from (optional): any date in the FIRST month they owe. Empty = from the
 *   month after the resident before them moved out (or from the start).
 * Unpaid months inside that range are the old resident's; every other unpaid
 * month belongs to whoever lives there now.
 */

const Debt = (function() {
  const MONTHLY_AMOUNT = 50;
  const MOVE_OUT_HEADERS = ['apartment', 'name', 'moved_out'];

  /** Months since year 0, so two months compare with < and > */
  function monthIndex(year, month) {
    return year * 12 + month;
  }

  /** Month index of a date cell, or null if it can't be read */
  function cellMonth(value) {
    const date = Projects.parseDate(value);
    return date ? monthIndex(date.getFullYear(), date.getMonth()) : null;
  }

  /**
   * Parse the MoveOuts sheet
   * @param {Object|null} raw - Parsed sheet { cols, rows }, or null if it failed to load
   * @returns {Array} [{ apartment, name, from, to }] month indexes, oldest move-out first
   */
  function parseMoveOuts(raw) {
    if (!raw || !Projects.hasHeaders(raw.cols, MOVE_OUT_HEADERS)) return [];

    return raw.rows
      .map(row => ({
        apartment: Number(row[0]),
        name: row[1] ? String(row[1]).trim() : '',
        to: cellMonth(row[2]),
        from: cellMonth(row[3])
      }))
      .filter(entry => entry.apartment > 0 && entry.to !== null)
      .sort((a, b) => a.to - b.to);
  }

  /**
   * The months each past resident of an apartment is responsible for
   * @param {Array} moveOuts - From parseMoveOuts
   * @param {number|string} apartment - Apartment number
   * @returns {Array} [{ name, from, to }] month indexes; from = null means "from the start"
   */
  function previousRanges(moveOuts, apartment) {
    const own = moveOuts.filter(entry => entry.apartment === Number(apartment));
    return own.map((entry, i) => {
      const afterPrevious = i > 0 ? own[i - 1].to + 1 : null;
      const from = [afterPrevious, entry.from].filter(value => value !== null);
      return { name: entry.name, from: from.length ? Math.max(...from) : null, to: entry.to };
    });
  }

  /**
   * Is this month a past resident's to pay?
   * @param {Array} ranges - From previousRanges
   * @param {number} year - Year
   * @param {number} month - Month 0-11
   * @returns {boolean} True if it falls inside a past resident's range
   */
  function isPrevious(ranges, year, month) {
    const index = monthIndex(Number(year), month);
    return ranges.some(range => (range.from === null || index >= range.from) && index <= range.to);
  }

  /**
   * Unpaid months of one year
   * 0 means discount (paid yearly), so it is not debt.
   * @param {Array} yearPayments - 12 entries { amount } (or missing)
   * @param {number} year - The year these payments are for
   * @param {number} monthLimit - Check months 0..monthLimit-1
   * @param {Function} [keep] - (year, month) => boolean, which months to count
   * @returns {Array} [{ year, month, owed, partial }]
   */
  function owedMonths(yearPayments, year, monthLimit, keep) {
    const months = [];
    for (let month = 0; month < monthLimit; month++) {
      if (keep && !keep(year, month)) continue;

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

    return previousRanges(moveOuts, apartment)
      .map(range => {
        const inRange = (year, month) => isPrevious([range], year, month);
        const months = [
          ...owedMonths(payments[currentYear - 1], currentYear - 1, 12, inRange),
          ...owedMonths(payments[currentYear], currentYear, now.getMonth(), inRange)
        ];
        return { name: range.name, months, owed: total(months) };
      })
      .filter(resident => resident.owed > 0)
      .reverse();
  }

  return {
    MONTHLY_AMOUNT,
    MOVE_OUT_HEADERS,
    monthIndex,
    parseMoveOuts,
    previousRanges,
    isPrevious,
    owedMonths,
    total,
    previousResidents
  };
})();

if (typeof module !== 'undefined') {
  module.exports = Debt;
}
