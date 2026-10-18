/**
 * Expenses by Month
 * Groups the Expence sheet rows by the date written in their notes column.
 * Pure functions only - Node-testable.
 */

const Expenses = (function() {
  /**
   * Round a money total to agorot
   * @param {number} value - Amount
   * @returns {number} Rounded amount
   */
  function round(value) {
    return Math.round(value * 100) / 100;
  }

  /**
   * Group expenses by month
   * Undated rows join the month of the nearest dated row above them in sheet order
   * (or the first dated row, if none is above).
   * @param {Array<Object>} expenses - Expenses in sheet order (oldest first)
   * @returns {Array<Object>} [{ year, month, total, types: [{ type, count, total }], items }], newest month first
   */
  function groupByMonth(expenses) {
    const dated = expenses.map((expense, index) => ({ expense, index, date: Projects.parseDate(expense.notes) }));

    const firstDate = (dated.find(entry => entry.date) || {}).date || null;
    let lastDate = firstDate;
    dated.forEach(entry => {
      if (entry.date) lastDate = entry.date;
      entry.groupDate = entry.date || lastDate;
    });

    const groups = new Map();
    dated.forEach(entry => {
      const key = entry.groupDate ? `${entry.groupDate.getFullYear()}-${entry.groupDate.getMonth()}` : 'none';
      if (!groups.has(key)) {
        groups.set(key, {
          year: entry.groupDate ? entry.groupDate.getFullYear() : null,
          month: entry.groupDate ? entry.groupDate.getMonth() : null,
          entries: []
        });
      }
      groups.get(key).entries.push(entry);
    });

    return [...groups.values()]
      .sort((a, b) => (b.year - a.year) || (b.month - a.month))
      .map(group => {
        // Newest first: by date, then by sheet position
        const entries = group.entries.sort((a, b) =>
          ((b.groupDate || 0) - (a.groupDate || 0)) || (b.index - a.index));

        const types = new Map();
        entries.forEach(({ expense }) => {
          const type = String(expense.type).trim();
          const summary = types.get(type) || { type, count: 0, total: 0 };
          summary.count++;
          summary.total = round(summary.total + Number(expense.price || 0));
          types.set(type, summary);
        });

        return {
          year: group.year,
          month: group.month,
          total: round(entries.reduce((sum, { expense }) => sum + Number(expense.price || 0), 0)),
          types: [...types.values()].sort((a, b) => Math.abs(b.total) - Math.abs(a.total)),
          items: entries.map(({ expense }) => expense)
        };
      });
  }

  // Public API
  return {
    groupByMonth
  };
})();

if (typeof module !== 'undefined') {
  module.exports = Expenses;
}
