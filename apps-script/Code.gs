/**
 * Manzel admin - Apps Script web app
 * Receives POST {pin, action, ...} from the admin page and writes to this spreadsheet.
 * The PIN is read from Script Property ADMIN_PIN; it is never stored in code.
 * Pure logic lives in Logic.gs.
 */

const LOCK_PROPERTY = 'ADMIN_LOCK';
const PIN_PROPERTY = 'ADMIN_PIN';
const RECEIPTS_FOLDER_PROPERTY = 'RECEIPTS_FOLDER_ID';
const RECEIPTS_FOLDER_NAME = 'Manzel receipts';

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

  const tzError = timeZoneError(Session.getScriptTimeZone(), SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone());
  if (tzError) return { ok: false, error: 'server', message: tzError };

  // A retried request (same id) returns the first result instead of writing again
  const cache = CacheService.getScriptCache();
  const cacheKey = requestCacheKey(request.requestId);
  const previous = cacheKey && cache.get(cacheKey);
  if (previous) return JSON.parse(previous);

  let result;
  if (request.action === 'monthly') result = writeMonthly(request);
  else if (request.action === 'project') result = writeProject(request);
  else if (request.action === 'projectExpense') result = writeProjectExpense(request);
  else result = writeExpense(request);

  if (cacheKey && result.ok) cache.put(cacheKey, JSON.stringify(result), 6 * 60 * 60);
  return result;
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
  const row = firstEmptyRow(sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), 5).getValues());
  sheet.getRange(row, 4).setNumberFormat('@');
  sheet.getRange(row, 1, 1, 5).setValues([buildProjectRow(request)]);
  return { ok: true, message: `Added project payment in row ${row}`, row };
}

/**
 * Append an expense row (columns A-D only), uploading the receipt file first if there is one
 * @param {Object} request - { type, amount, date, receipt?, receiptFile? }
 * @returns {Object} Response with the sheet row and receipt link
 */
function writeExpense(request) {
  const receipt = request.receiptFile ? uploadReceipt(request) : request.receipt;
  const sheet = getSheet('Expence');
  const row = firstEmptyRow(sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), 4).getValues());
  sheet.getRange(row, 1, 1, 4).setValues([buildExpenseRow({ ...request, receipt })]);
  return { ok: true, message: `Added expense in row ${row}`, row, receipt: receipt || '' };
}

/**
 * Append money paid out of a project's pot to ProjectExpenses (columns A-E)
 * @param {Object} request - { projectId, type, amount, date, receiptFile? }
 * @returns {Object} Response with the sheet row and receipt link
 */
function writeProjectExpense(request) {
  const receipt = request.receiptFile ? uploadReceipt(request) : '';
  const sheet = getSheet('ProjectExpenses');
  const row = firstEmptyRow(sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), 5).getValues());
  sheet.getRange(row, 3).setNumberFormat('@');
  sheet.getRange(row, 1, 1, 5).setValues([buildProjectExpenseRow(request, receipt)]);
  return { ok: true, message: `Added project expense in row ${row}`, row, receipt };
}

/**
 * Save a receipt to the "Manzel receipts" Drive folder, viewable by anyone with the link
 * @param {Object} request - Expense request with receiptFile { mimeType, data }
 * @returns {string} Drive link to the file
 */
function uploadReceipt(request) {
  const file = request.receiptFile;
  const blob = Utilities.newBlob(Utilities.base64Decode(file.data), file.mimeType, receiptFileName(request, file));
  const driveFile = getReceiptsFolder().createFile(blob);
  driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return driveFile.getUrl();
}

/**
 * The receipts folder, created on first use; its id is kept in Script Properties
 * @returns {Folder} Drive folder
 */
function getReceiptsFolder() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(RECEIPTS_FOLDER_PROPERTY);
  if (id) {
    try {
      const folder = DriveApp.getFolderById(id);
      if (!folder.isTrashed()) return folder;
    } catch (error) {
      // Folder was deleted - create a new one below
    }
  }
  const folder = DriveApp.createFolder(RECEIPTS_FOLDER_NAME);
  props.setProperty(RECEIPTS_FOLDER_PROPERTY, folder.getId());
  return folder;
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
