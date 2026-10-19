# Admin Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A PIN-protected admin page that records monthly payments, project payments and expenses into the Google Sheet through an Apps Script web app.

**Architecture:** Static `admin/index.html` + `js/admin.js` call a Google Apps Script web app (bound to the spreadsheet) with `POST {pin, action, ...}`. All sheet logic that can be pure lives in `apps-script/Logic.gs` (Node-testable); `apps-script/Code.gs` is a thin SpreadsheetApp/PropertiesService wrapper. The footer "~" button becomes the entry point.

**Tech Stack:** Vanilla HTML/CSS/JS (IIFE), Google Apps Script (V8), Node 22 `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-18-admin-page-design.md`

## Global Constraints

- The PIN value never appears in any repo file, commit, plan, or test. Script reads Script Property `ADMIN_PIN`; e2e checks get the PIN from the conversation only.
- Never overwrite a non-empty `Payments` cell; never touch `Expence` columns E+; never modify other tabs except the one `total!A2` formula change.
- `total!A2` → `=SUM(Payments!B2:J)+SUM(Expence!B2:B)`; displayed value must be identical before/after (601.1 at planning time) or revert.
- Lockout: 5 wrong PINs → lock all requests for `10 min × 2^round`, capped at 24 h; correct PIN resets. State in Script Properties.
- Project payment `date` written as text `dd/mm/yyyy`; expense date written as a real Date; expense amount stored negative.
- Apps Script project time zone `Asia/Jerusalem`.
- New UI strings in all 5 languages; RTL-safe CSS; existing theme variables.
- Fresh full backup (`backups/<date>-pre-admin/`) before any sheet write.
- Requests use `fetch(url, {method:'POST', body: JSON.stringify(payload)})` with no custom headers (no CORS preflight).

## Review Focus

- **Month cell formats:** `Payments` column A is a Date (stored year 2023 on every row) or Hebrew text like `" אוק׳"`; lookup must use the `year` column, never the Date's year — test in Task 1.
- **Pre-formatted empty rows:** `Expence` rows 240+ are formatted but empty; append must target the first empty column-A row, not `getLastRow()+1` — test in Task 1.
- **Already-paid months / 0 discount cells:** `0` is a value, not empty; it must be skipped, not overwritten — test in Task 1.
- **Lockout boundary:** 4 fails → not locked; 5th → locked 10 min; after expiry next 5 → 20 min; correct PIN resets round — test in Task 1.
- **Concurrent saves** (double-tap Save): two requests must not both append into the same empty row — `LockService` in Task 2, UI disables the button while saving in Task 4.

---

### Task 1: `apps-script/Logic.gs` pure sheet logic + tests

**Files:**
- Create: `apps-script/Logic.gs`
- Test: `tests/apps-script.test.js`

**Interfaces (produces; all plain functions, `module.exports = {...}` guarded by `typeof module !== 'undefined'`):**
- `monthIndexOf(cell: Date|string) -> number` — Date → `getMonth()`; string → index of first matching Hebrew abbreviation (`ינו פבר מרץ אפר מאי יונ יול אוג ספט אוק נוב דצמ`, written as `\u` escapes); else `-1`.
- `findPaymentRow(values: any[][], year: number, month: number) -> number` — `values` is `getDataRange().getValues()` incl. header row 0; year column found by header `year` (case-insensitive); returns 0-based row index or `-1`.
- `planMonthly(values, {apartment: number, year: number, amounts: {[month: number]: number}}) -> {writes: Array<{row: number, col: number, value: number}>, skipped: number[], missing: number[]}` — `row`/`col` are 1-based sheet coordinates (col = apartment + 1); non-empty cell (including `0`) → `skipped`; month row absent → `missing`.
- `firstEmptyRow(columnA: any[]) -> number` — 1-based sheet row of the first empty cell after the header (`''`/`null`); `columnA.length + 1` if none.
- `buildExpenseRow({type: string, amount: number, date: string /* yyyy-mm-dd */, receipt?: string}) -> [string, number, string, Date]` — amount → `-Math.abs(amount)`.
- `buildProjectRow({projectId, apartment, amount, date /* yyyy-mm-dd */, method}) -> [string, number, number, string, string]` — date → `dd/mm/yyyy`; method ∉ {cash,bit,paybox} → `cash`.
- `validate(action: string, payload: object) -> string|null` — error message or null (apartment 1–9 integer, year 2020–2100, months 0–11, amount > 0 for project/expense and ≥ 0 for monthly, non-empty type/projectId, date `yyyy-mm-dd`).
- `lockState(state: {fails: number, round: number, lockedUntil: number}|null, now: number) -> {locked: boolean, retryAt: number}`; `afterFailure(state, now) -> state` (5th failure sets `lockedUntil = now + min(10min × 2^round, 24h)`, `round+1`, `fails 0`); `afterSuccess() -> {fails: 0, round: 0, lockedUntil: 0}`.

- [ ] **Step 1: Write failing tests** in `tests/apps-script.test.js` (`require('../apps-script/Logic.gs')`), with fixtures copied from the backup shape:
  - `monthIndexOf(new Date(2023, 9, 1)) === 9`; `monthIndexOf(' אוק׳') === 9`; `monthIndexOf('x') === -1`.
  - `findPaymentRow` on a header + 2026/2025 rows whose Dates all carry year 2023 → `(2026, 9)` returns the 2026-October index; `(2027, 0)` → `-1`.
  - `planMonthly` apt 4, 2026, `{8: 50, 9: 50}` where Sep is empty and Oct is `0` → `writes = [{row: <sep row>, col: 5, value: 50}]`, `skipped = [9]`; year 2027 → `missing = [8, 9]`, no writes.
  - `firstEmptyRow(['סוג', 'מנקה', 'חשמל', '', '', null]) === 4`; `firstEmptyRow(['h', 'a']) === 3`.
  - `buildExpenseRow({type: 'מנקה', amount: 50, date: '2026-10-18'})` → `['מנקה', -50, '', Date(2026-10-18)]`.
  - `buildProjectRow({projectId: 'roof-stairs-2026', apartment: 3, amount: 1700, date: '2026-10-20', method: 'BIT'})` → `['roof-stairs-2026', 3, 1700, '20/10/2026', 'cash']` (unknown-case method → cash); `'bit'` stays `'bit'`.
  - `validate('monthly', {apartment: 10, ...})` → error; valid payloads → `null`.
  - Lockout: 4 failures → `locked false`; 5th at t → `locked true`, `retryAt t+10min`; after expiry 5 more → `retryAt +20min`; `afterSuccess()` → round 0; cap: round 20 → 24 h.
- [ ] **Step 2:** `node --test tests/*.test.js` → new tests FAIL (module missing).
- [ ] **Step 3:** Implement `apps-script/Logic.gs` per Interfaces (no Apps Script globals used in this file).
- [ ] **Step 4:** `node --test tests/*.test.js` → all pass.
- [ ] **Step 5: Commit** `git add apps-script/Logic.gs tests/apps-script.test.js && git commit -m "feat: add admin sheet logic for apps script"`

### Task 2: `apps-script/Code.gs` web app wrapper

**Files:**
- Create: `apps-script/Code.gs`, `apps-script/README.md` (deploy steps; no PIN)

**Interfaces:**
- Consumes: everything in Task 1.
- Produces: web app contract. Request JSON `{pin, action: 'verify'|'monthly'|'project'|'expense', ...payload}`. Response JSON `{ok: true, message: string, ...}` or `{ok: false, error: 'locked'|'bad_pin'|'invalid'|'missing_year'|'server', message: string, retryAt?: number}`. `monthly` success includes `written: number[]` (months) and `skipped: number[]`.

- [ ] **Step 1:** `doPost(e)`: parse `e.postData.contents`; `LockService.getScriptLock().waitLock(10000)` around everything; lock state from `PropertiesService.getScriptProperties()` key `ADMIN_LOCK` (JSON); compare `pin` with property `ADMIN_PIN` (missing property → `server` error); update lock state; dispatch:
  - `monthly`: sheet `Payments` → `planMonthly`; any `missing` → `missing_year` (no writes); else `setValue` each write; return written/skipped.
  - `project`: sheet `ProjectPayments` → `firstEmptyRow` on column A → `setValues([buildProjectRow])` at A:E; set that row's D cell number format `@` before writing.
  - `expense`: sheet `Expence` → `firstEmptyRow` on column A → `setValues([buildExpenseRow])` at A:D only.
  - Output via `ContentService.createTextOutput(JSON.stringify(r)).setMimeType(ContentService.MimeType.JSON)`; exceptions → `server`.
- [ ] **Step 2:** `README.md`: create files in the bound project, set time zone `Asia/Jerusalem`, add Script Property `ADMIN_PIN`, deploy as web app (execute as me, anyone), copy the `/exec` URL into `js/admin-api.js`.
- [ ] **Step 3: Verify** `node -e "new Function(require('fs').readFileSync('apps-script/Code.gs','utf8'))"` → no syntax error; `node --test tests/*.test.js` still passes.
- [ ] **Step 4: Commit** `git add apps-script/ && git commit -m "feat: add apps script web app for admin writes"`

### Task 3: Deploy the script and fix the total formula (live sheet)

**Files:**
- External: spreadsheet `1_zdYPJNYSifPeQPI5CtqhfnvgzOFgxjOUe0jJDVzo1c`

- [ ] **Step 1:** Fresh backup to `backups/<today>-pre-admin/` (xlsx + per-tab CSVs incl. `Projects`, `ProjectPayments`).
- [ ] **Step 2:** In Chrome: Extensions → Apps Script; create `Logic.gs` and `Code.gs` with the repo contents; project settings → time zone `Asia/Jerusalem`, Script Property `ADMIN_PIN` (value from chat). Deploy → Web app (execute as me, anyone). **Amir clicks Google's "Allow" himself.** Record the `/exec` URL.
- [ ] **Step 3: Verify** with `curl -sL -X POST -d '{"pin":"0000","action":"verify"}' <url>` → `{"ok":false,"error":"bad_pin"...}`; with the real PIN (typed from chat, not saved to any file) → `{"ok":true...}`. Then reset the lockout counter state by one correct verify.
- [ ] **Step 4:** Note `total` displayed value; set `total!A2` to `=SUM(Payments!B2:J)+SUM(Expence!B2:B)`; re-read via gviz → identical value, else revert.

### Task 4: Admin client + admin page

**Files:**
- Create: `js/admin-api.js` (`AdminAPI` IIFE), `admin/index.html`, `js/admin.js` (`AdminPage` IIFE)
- Modify: `css/styles.css`, `js/i18n.js`
- Test: `tests/admin-api.test.js`

**Interfaces:**
- Consumes: Task 2 contract + URL from Task 3; `SheetsAPI.fetchAllData`, `Projects.summarize`.
- Produces: `AdminAPI.ENDPOINT` (the `/exec` URL); `AdminAPI.call(action: string, payload: object) -> Promise<object>` (adds stored PIN, POSTs, parses JSON; on `ok` clears `sessionStorage['manzel_data_v6']`); `AdminAPI.login(pin: string) -> Promise<object>` (calls `verify` with that PIN; on ok stores PIN in `sessionStorage['manzel_admin_pin']` and sets `localStorage['manzel_admin'] = 'true'`); `AdminAPI.logout()` (removes both); `AdminAPI.isLoggedIn() -> boolean` (admin flag and stored PIN both present).
- New i18n keys: `adminTitle`, `adminPin`, `adminLogin`, `adminWrongPin`, `adminLocked` (`{time}`), `adminMonthly`, `adminProject`, `adminExpense`, `adminWholeYear`, `adminSave`, `adminSaved`, `adminSkipped` (`{months}`), `adminMissingYear` (`{year}`), `adminAmount`, `adminDate`, `adminMethod`, `adminType`, `adminReceipt`, `adminLogout`.

- [ ] **Step 1: Write failing tests** `tests/admin-api.test.js` with fake `fetch`/`sessionStorage`/`localStorage`:
  - `call` POSTs to `ENDPOINT` with body `{pin, action, ...payload}` and **no** `headers` option.
  - `login('9999')` with fake `{ok:false,error:'bad_pin'}` → no PIN stored, admin flag unset; with `{ok:true}` → both set.
  - successful `call('expense', …)` removes `manzel_data_v6`; failed call leaves it.
- [ ] **Step 2:** `node --test tests/*.test.js` → FAIL.
- [ ] **Step 3:** Implement `js/admin-api.js` (module.exports guard like `js/projects.js`).
- [ ] **Step 4:** `node --test tests/*.test.js` → pass.
- [ ] **Step 5:** `admin/index.html` (relative `../` asset paths, `noindex`, header with back + language, footer theme) and `js/admin.js`:
  - PIN screen when `!AdminAPI.isLoggedIn()`; errors `adminWrongPin` / `adminLocked` (retryAt formatted as time).
  - Segmented control Monthly / Project / Expense, per spec "Admin page UX": apartment buttons (display names via the same rule as `js/project.js`), month chips with paid months disabled (current year from public data), `adminWholeYear` sends `{0..10: 50, 11: 0}`; project picker of open projects with remaining amount pre-filled; expense type with `<datalist>` of existing types.
  - Save button disabled while a request is in flight; success shows `adminSaved` with a summary (+ `adminSkipped` when any), then `SheetsAPI.fetchAllData(true)` and re-render; `missing_year` → `adminMissingYear`.
  - Logout button → `AdminAPI.logout()` → back to PIN screen.
- [ ] **Step 6: Verify** locally at `http://localhost:8000/admin/` (390px, he + en, light + dark): wrong PIN message, correct PIN shows the three segments, paid months disabled, no console errors. (No real save in this step.)
- [ ] **Step 7: Commit** `git add js/admin-api.js js/admin.js admin/ css/styles.css js/i18n.js tests/admin-api.test.js && git commit -m "feat: add admin page"`

### Task 5: Footer "~" entry point

**Files:**
- Modify: `index.html` (admin toggle script), `resident.html` (load `js/admin-api.js` only if needed for `isLoggedIn`)

**Interfaces:**
- Consumes: `AdminAPI.isLoggedIn`, `AdminAPI.logout`.

- [ ] **Step 1:** "~" click: if `AdminAPI.isLoggedIn()` → `logout()` and update the button state; else navigate to `admin/` (its PIN screen is the prompt). Button active state reflects `isLoggedIn()`.
- [ ] **Step 2:** Resident page copy/WhatsApp buttons gate on `localStorage.manzel_admin === 'true'` as today (set only by `login`) — no change needed beyond confirming.
- [ ] **Step 3: Verify:** tap "~" → admin PIN screen; after login, back to index → "~" shows active; tap → off.
- [ ] **Step 4: Commit** `git add index.html resident.html && git commit -m "feat: footer admin button opens PIN-protected admin page"`

### Task 6: End-to-end writes against the live sheet + docs

**Files:**
- Modify: `CLAUDE.md` (admin page, Apps Script, `apps-script/` folder, tests, total formula)

- [ ] **Step 1:** From the local admin page with the real PIN: one monthly write into a currently-empty cell (e.g. a past-month gap), one project payment, one expense. Each response `ok`; each value visible via gviz.
- [ ] **Step 2:** Clean up exactly those three: blank the monthly cell, delete the two appended rows' contents (A:E / A:D). Re-download all tabs; `diff` against `backups/<today>-pre-admin/` → only `total!A2` formula differs (value same).
- [ ] **Step 3:** Update `CLAUDE.md`; `node --test tests/*.test.js` passes.
- [ ] **Step 4: Commit** `git add CLAUDE.md && git commit -m "docs: document admin page"`
