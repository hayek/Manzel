/**
 * Manzel admin - pure sheet logic
 * No Apps Script services here, so the same file runs in Apps Script and in Node tests.
 */

// ינו פבר מרץ אפר מאי יונ יול אוג ספט אוק נוב דצמ
const HEBREW_MONTHS = [
  'ינו', 'פבר', 'מרץ', 'אפר',
  'מאי', 'יונ', 'יול', 'אוג',
  'ספט', 'אוק', 'נוב', 'דצמ'
];
const METHODS = ['cash', 'bit', 'paybox'];
const LOCK_AFTER_FAILURES = 5;
const LOCK_BASE_MS = 10 * 60 * 1000;
const LOCK_MAX_MS = 24 * 60 * 60 * 1000;

/**
 * Month index of a Payments month cell
 * @param {Date|string} cell - Date cell, or Hebrew month text like " אוק׳"
 * @returns {number} 0-11, or -1 if unknown
 */
function monthIndexOf(cell) {
  if (cell instanceof Date) return cell.getMonth();
  const text = String(cell || '');
  if (!text.trim()) return -1;
  return HEBREW_MONTHS.findIndex(month => text.includes(month));
}

/**
 * Find the Payments row for a month and year
 * Month cells all store the same year, so the year comes from the "year" column.
 * @param {Array<Array>} values - Sheet values including the header row
 * @param {number} year - Full year
 * @param {number} month - 0-11
 * @returns {number} 0-based index into values, or -1
 */
function findPaymentRow(values, year, month) {
  const yearCol = values[0].findIndex(label => String(label).trim().toLowerCase() === 'year');
  if (yearCol < 0) return -1;
  for (let r = 1; r < values.length; r++) {
    if (Number(values[r][yearCol]) === year && monthIndexOf(values[r][0]) === month) return r;
  }
  return -1;
}

/**
 * Is a cell empty? (0 is a value - it marks the yearly discount)
 * @param {*} cell - Cell value
 * @returns {boolean} True if empty
 */
function isEmpty(cell) {
  return cell === '' || cell === null || cell === undefined;
}

/**
 * Plan the writes for a monthly payment, never overwriting a filled cell
 * @param {Array<Array>} values - Payments values including the header row
 * @param {Object} request - { apartment, year, amounts: { month: amount } }
 * @returns {Object} { writes: [{ row, col, value }] (1-based), written: [month], skipped: [month], missing: [month] }
 */
function planMonthly(values, request) {
  const months = Object.keys(request.amounts).map(Number).sort((a, b) => a - b);
  const writes = [];
  const written = [];
  const skipped = [];
  const missing = [];

  months.forEach(month => {
    const row = findPaymentRow(values, request.year, month);
    if (row < 0) {
      missing.push(month);
    } else if (!isEmpty(values[row][request.apartment])) {
      skipped.push(month);
    } else {
      writes.push({ row: row + 1, col: request.apartment + 1, value: request.amounts[month] });
      written.push(month);
    }
  });

  if (missing.length > 0) return { writes: [], written: [], skipped, missing };
  return { writes, written, skipped, missing };
}

/**
 * First fully empty row after the header (ignores pre-formatted empty rows below the data,
 * and never lands on a hand-edited row that has data in any column)
 * @param {Array<Array>} rows - Values of the columns being written, including the header
 * @returns {number} 1-based sheet row
 */
function firstEmptyRow(rows) {
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].every(cell => isEmpty(cell) || String(cell).trim() === '')) return i + 1;
  }
  return rows.length + 1;
}

/**
 * Keep user text as plain text: Sheets reads a leading = + - @ as a formula
 * @param {*} value - Text typed in the admin page
 * @returns {string} Trimmed text, prefixed with ' when needed
 */
function plainText(value) {
  const text = String(value || '').trim();
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

/**
 * Cache key for a client request id, used to ignore a retried request
 * @param {*} requestId - Id sent by the admin page
 * @returns {string|null} Cache key, or null if the id is missing or malformed
 */
function requestCacheKey(requestId) {
  return /^[A-Za-z0-9-]{16,64}$/.test(String(requestId || '')) ? `req:${requestId}` : null;
}

/**
 * Parse a yyyy-mm-dd date (from <input type="date">)
 * @param {string} text - Date text
 * @returns {Date|null} Local date, or null if invalid
 */
function parseIsoDate(text) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text || ''));
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3]) ? date : null;
}

/**
 * Build an Expence row: type, negative amount, receipt, date
 * @param {Object} request - { type, amount, date (yyyy-mm-dd), receipt? }
 * @returns {Array} Row values for columns A-D
 */
function buildExpenseRow(request) {
  return [plainText(request.type), -Math.abs(Number(request.amount)), plainText(request.receipt), parseIsoDate(request.date)];
}

/**
 * Build a ProjectPayments row; the date is text dd/mm/yyyy
 * @param {Object} request - { projectId, apartment, amount, date (yyyy-mm-dd), method }
 * @returns {Array} Row values for columns A-E
 */
function buildProjectRow(request) {
  const [year, month, day] = String(request.date).split('-');
  const method = String(request.method || '').toLowerCase();
  return [
    plainText(request.projectId),
    Number(request.apartment),
    Number(request.amount),
    `${day}/${month}/${year}`,
    METHODS.includes(method) ? method : 'cash'
  ];
}

/**
 * Validate a request payload
 * @param {string} action - monthly | project | expense
 * @param {Object} p - Payload
 * @returns {string|null} Error message, or null if valid
 */
function validate(action, p) {
  const isApartment = n => Number.isInteger(n) && n >= 1 && n <= 9;
  const isText = s => typeof s === 'string' && s.trim() !== '';

  if (action === 'monthly') {
    if (!isApartment(p.apartment)) return 'apartment must be 1-9';
    if (!Number.isInteger(p.year) || p.year < 2020 || p.year > 2100) return 'invalid year';
    const entries = Object.entries(p.amounts || {});
    if (entries.length === 0) return 'no months selected';
    for (const [month, amount] of entries) {
      if (!/^(\d|1[01])$/.test(month)) return 'invalid month';
      if (typeof amount !== 'number' || !(amount >= 0)) return 'invalid amount';
    }
    return null;
  }
  if (action === 'project') {
    if (!isText(p.projectId)) return 'missing project';
    if (!isApartment(p.apartment)) return 'apartment must be 1-9';
    if (typeof p.amount !== 'number' || !(p.amount > 0)) return 'invalid amount';
    if (!parseIsoDate(p.date)) return 'invalid date';
    return null;
  }
  if (action === 'expense') {
    if (!isText(p.type)) return 'missing type';
    if (typeof p.amount !== 'number' || !(p.amount > 0)) return 'invalid amount';
    if (!parseIsoDate(p.date)) return 'invalid date';
    return null;
  }
  return 'unknown action';
}

/**
 * Dates are built and read in the script's time zone but stored in the spreadsheet's;
 * if they differ, a write could land on the wrong day or month.
 * @param {string} scriptTz - Session.getScriptTimeZone()
 * @param {string} sheetTz - Spreadsheet time zone
 * @returns {string|null} Error message, or null if they match
 */
function timeZoneError(scriptTz, sheetTz) {
  return scriptTz === sheetTz ? null : `Script time zone (${scriptTz}) differs from spreadsheet time zone (${sheetTz})`;
}

/**
 * Is the admin endpoint locked?
 * @param {Object|null} state - { fails, round, lockedUntil }
 * @param {number} now - Epoch ms
 * @returns {Object} { locked, retryAt }
 */
function lockState(state, now) {
  const locked = Boolean(state && state.lockedUntil > now);
  return { locked, retryAt: locked ? state.lockedUntil : 0 };
}

/**
 * Record a wrong PIN; every 5th failure locks for 10 min x 2^round (max 24 h)
 * @param {Object|null} state - Current lock state
 * @param {number} now - Epoch ms
 * @returns {Object} New lock state
 */
function afterFailure(state, now) {
  const current = state || afterSuccess();
  const fails = current.fails + 1;
  if (fails < LOCK_AFTER_FAILURES) {
    return { fails, round: current.round, lockedUntil: current.lockedUntil };
  }
  const duration = Math.min(LOCK_BASE_MS * Math.pow(2, current.round), LOCK_MAX_MS);
  return { fails: 0, round: current.round + 1, lockedUntil: now + duration };
}

/**
 * Lock state after a correct PIN
 * @returns {Object} Reset lock state
 */
function afterSuccess() {
  return { fails: 0, round: 0, lockedUntil: 0 };
}

if (typeof module !== 'undefined') {
  module.exports = {
    monthIndexOf,
    findPaymentRow,
    planMonthly,
    firstEmptyRow,
    plainText,
    requestCacheKey,
    parseIsoDate,
    buildExpenseRow,
    buildProjectRow,
    validate,
    timeZoneError,
    lockState,
    afterFailure,
    afterSuccess
  };
}
