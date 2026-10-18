/**
 * Manzel admin - Apps Script web app
 * Receives POST {pin, action, ...} from the admin page and writes to this spreadsheet.
 * The PIN is read from Script Property ADMIN_PIN; it is never stored in code.
 * Pure logic lives in Logic.gs.
 */

const LOCK_PROPERTY = 'ADMIN_LOCK';
const PIN_PROPERTY = 'ADMIN_PIN';

/**
 * Web app entry point
 * @param {Object} e - Apps Script event with postData
 * @returns {TextOutput} JSON response
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    return respond(handle(JSON.parse(e.postData.contents)));
  } catch (error) {
    return respond({ ok: false, error: 'server', message: String(error && error.message || error) });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Check the PIN and dispatch the action
 * @param {Object} request - Parsed request body
 * @returns {Object} Response object
 */
function handle(request) {
  const props = PropertiesService.getScriptProperties();
  const pin = props.getProperty(PIN_PROPERTY);
  if (!pin) return { ok: false, error: 'server', message: 'ADMIN_PIN is not configured' };

  const now = Date.now();
  const state = JSON.parse(props.getProperty(LOCK_PROPERTY) || 'null');
  const lockInfo = lockState(state, now);
  if (lockInfo.locked) {
    return { ok: false, error: 'locked', message: 'Too many wrong PINs', retryAt: lockInfo.retryAt };
  }

  if (String(request.pin) !== pin) {
    const next = afterFailure(state, now);
    props.setProperty(LOCK_PROPERTY, JSON.stringify(next));
    const nextLock = lockState(next, now);
    return nextLock.locked
      ? { ok: false, error: 'locked', message: 'Too many wrong PINs', retryAt: nextLock.retryAt }
      : { ok: false, error: 'bad_pin', message: 'Wrong PIN' };
  }
  props.setProperty(LOCK_PROPERTY, JSON.stringify(afterSuccess()));

  if (request.action === 'verify') return { ok: true, message: 'PIN ok' };

  const invalid = validate(request.action, request);
  if (invalid) return { ok: false, error: 'invalid', message: invalid };

  if (request.action === 'monthly') return writeMonthly(request);
  if (request.action === 'project') return writeProject(request);
  return writeExpense(request);
}

/**
 * Write monthly payments into the Payments grid
 * @param {Object} request - { apartment, year, amounts }
 * @returns {Object} Response with written and skipped months
 */
function writeMonthly(request) {
  const sheet = getSheet('Payments');
  const plan = planMonthly(sheet.getDataRange().getValues(), request);
  if (plan.missing.length > 0) {
    return { ok: false, error: 'missing_year', message: `No rows for ${request.year}`, year: request.year };
  }
  plan.writes.forEach(write => sheet.getRange(write.row, write.col).setValue(write.value));
  return {
    ok: true,
    message: `Wrote ${plan.writes.length} month(s)`,
    written: plan.written,
    skipped: plan.skipped
  };
}

/**
 * Append a project payment row
 * @param {Object} request - { projectId, apartment, amount, date, method }
 * @returns {Object} Response with the sheet row
 */
function writeProject(request) {
  const sheet = getSheet('ProjectPayments');
  const row = firstEmptyRow(sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), 1).getValues().map(r => r[0]));
  sheet.getRange(row, 4).setNumberFormat('@');
  sheet.getRange(row, 1, 1, 5).setValues([buildProjectRow(request)]);
  return { ok: true, message: `Added project payment in row ${row}`, row };
}

/**
 * Append an expense row (columns A-D only)
 * @param {Object} request - { type, amount, date, receipt }
 * @returns {Object} Response with the sheet row
 */
function writeExpense(request) {
  const sheet = getSheet('Expence');
  const row = firstEmptyRow(sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), 1).getValues().map(r => r[0]));
  sheet.getRange(row, 1, 1, 4).setValues([buildExpenseRow(request)]);
  return { ok: true, message: `Added expense in row ${row}`, row };
}

/**
 * Get a sheet by name or throw
 * @param {string} name - Sheet name
 * @returns {Sheet} Sheet
 */
function getSheet(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error(`Sheet "${name}" not found`);
  return sheet;
}

/**
 * Serialize a response as JSON
 * @param {Object} body - Response object
 * @returns {TextOutput} JSON output
 */
function respond(body) {
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}
