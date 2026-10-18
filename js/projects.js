/**
 * Building Projects
 * Parses the Projects / ProjectPayments sheets and computes who paid.
 * Pure functions only - shared by the dashboard, project and resident pages.
 */

const Projects = (function() {
  const PROJECT_HEADERS = ['id', 'name', 'description', 'per_apartment', 'total_cost', 'due_date', 'status'];
  const PAYMENT_HEADERS = ['project_id', 'apartment', 'amount', 'date', 'method'];

  const METHOD_ALIASES = {
    bit: 'bit',
    'ביט': 'bit',
    paybox: 'paybox',
    'פייבוקס': 'paybox'
  };

  /**
   * Check that a sheet starts with the expected header labels.
   * Guards against gviz silently returning the first tab when a tab is missing.
   * @param {Array<string>} cols - Column labels from the sheet
   * @param {Array<string>} expected - Expected labels, in order
   * @returns {boolean} True if all expected labels match
   */
  function hasHeaders(cols, expected) {
    if (!Array.isArray(cols) || cols.length < expected.length) return false;
    return expected.every((label, i) => String(cols[i] || '').trim().toLowerCase() === label);
  }

  /**
   * Parse a date cell: "25/10/2026", "25/10/26" or gviz "Date(2026,9,25)"
   * @param {string} value - Raw cell value
   * @returns {Date|null} Local-midnight date, or null if unparseable
   */
  function parseDate(value) {
    if (!value) return null;
    const text = String(value).trim();

    const gviz = text.match(/^Date\((\d+),(\d+),(\d+)/);
    if (gviz) {
      return new Date(Number(gviz[1]), Number(gviz[2]), Number(gviz[3]));
    }

    const dmy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
    if (dmy) {
      const year = dmy[3].length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3]);
      return new Date(year, Number(dmy[2]) - 1, Number(dmy[1]));
    }

    return null;
  }

  /**
   * Convert a cell to a trimmed string
   * @param {*} value - Raw cell value
   * @returns {string} Trimmed string ('' for null)
   */
  function text(value) {
    return value === null || value === undefined ? '' : String(value).trim();
  }

  /**
   * Parse the Projects sheet
   * @param {Object} raw - { cols, rows } from SheetsAPI
   * @returns {Array<Object>} Projects
   */
  function parseProjects(raw) {
    if (!raw || !hasHeaders(raw.cols, PROJECT_HEADERS)) return [];

    return raw.rows
      .filter(row => text(row[0]))
      .map(row => ({
        id: text(row[0]),
        name: text(row[1]),
        description: text(row[2]),
        perApartment: Number(row[3]) || 0,
        totalCost: Number(row[4]) || 0,
        dueDate: text(row[5]),
        status: text(row[6]).toLowerCase() === 'done' ? 'done' : 'open'
      }));
  }

  /**
   * Parse the ProjectPayments sheet
   * @param {Object} raw - { cols, rows } from SheetsAPI
   * @returns {Array<Object>} Payments
   */
  function parsePayments(raw) {
    if (!raw || !hasHeaders(raw.cols, PAYMENT_HEADERS)) return [];

    return raw.rows
      .map(row => ({
        projectId: text(row[0]),
        apartment: Number(row[1]),
        amount: Number(row[2]) || 0,
        date: text(row[3]),
        method: METHOD_ALIASES[text(row[4]).toLowerCase()] || 'cash'
      }))
      .filter(payment => payment.projectId && payment.amount > 0);
  }

  /**
   * Compute collection status for one project
   * @param {Object} project - Project from parseProjects
   * @param {Array<Object>} payments - All payments from parsePayments
   * @param {Array<number>} aptNumbers - Apartment numbers in the building
   * @returns {Object} Summary with goal, collected, paidCount and per-apartment status
   */
  function summarize(project, payments, aptNumbers) {
    const apartments = {};
    aptNumbers.forEach(apt => {
      apartments[apt] = { status: 'unpaid', paid: 0, remaining: project.perApartment, payments: [] };
    });

    payments.forEach(payment => {
      const apt = apartments[payment.apartment];
      if (payment.projectId !== project.id || !apt) return;
      apt.payments.push(payment);
      apt.paid += payment.amount;
    });

    let collected = 0;
    let paidCount = 0;
    Object.values(apartments).forEach(apt => {
      apt.remaining = Math.max(0, project.perApartment - apt.paid);
      if (apt.paid > 0) {
        apt.status = apt.remaining === 0 ? 'paid' : 'partial';
      }
      if (apt.status === 'paid') paidCount++;
      collected += Math.min(apt.paid, project.perApartment);
    });

    return {
      project,
      goal: project.perApartment * aptNumbers.length,
      collected,
      paidCount,
      aptCount: aptNumbers.length,
      apartments
    };
  }

  /**
   * Is the project past its due day and still missing money?
   * @param {Object} summary - Result of summarize()
   * @param {Date} now - Current time
   * @returns {boolean} True if overdue
   */
  function isOverdue(summary, now) {
    const due = parseDate(summary.project.dueDate);
    if (!due) return false;
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return due < today && summary.collected < summary.goal;
  }

  // Public API
  return {
    PROJECT_HEADERS,
    PAYMENT_HEADERS,
    hasHeaders,
    parseDate,
    parseProjects,
    parsePayments,
    summarize,
    isOverdue
  };
})();

if (typeof module !== 'undefined') {
  module.exports = Projects;
}
