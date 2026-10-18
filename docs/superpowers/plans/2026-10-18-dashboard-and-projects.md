# Dashboard Polish + Building Projects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the main dashboard (direction A) and add per-project payment tracking backed by two new Google Sheets tabs.

**Architecture:** Two new tabs (`Projects`, `ProjectPayments`) read through the existing gviz loader. A new pure, Node-testable module `js/projects.js` parses/validates those tabs and computes per-apartment status. The main page, a new `project.html`, and `resident.html` all render from that one module.

**Tech Stack:** Vanilla HTML/CSS/JS (IIFE modules, no build), Google Visualization API, Node 22 built-in test runner (`node --test`) for the pure module only.

**Spec:** `docs/superpowers/specs/2026-10-18-dashboard-and-projects-design.md`

## Global Constraints

- Zero runtime dependencies; IIFE module pattern; no build step.
- Never modify existing tabs (`Payments`, `total`, `Expence`, `building`, `Residents`, `Announcement`, `App Metadata`) — Glide is connected to this spreadsheet.
- Every new UI string exists in all 5 languages (he, en, ar, ru, uk) in `js/i18n.js`.
- RTL-safe CSS only (`margin-inline-*`, `padding-inline-*`, `inset-inline-*`); colors only via existing CSS variables so light/dark both work.
- Cache key becomes `manzel_data_v5`.
- New-tab loaders never fail the page: missing tab / header mismatch / fetch error → empty result.
- `backups/` and `.superpowers/` are git-ignored and never committed (phone numbers).
- First project row: `id=roof-stairs-2026`, `name=זיפות גג + מדרגות`, `per_apartment=1700`, `total_cost=15340`, `due_date=25/10/2026`, `status=open`. `ProjectPayments` starts with headers only.
- Work on branch `feature/projects-dashboard` (main deploys to GitHub Pages).

## Review Focus

- **Missing tab returns `Payments`** (gviz fallback): a deleted/renamed `Projects` tab must yield zero projects, not garbage — test in Task 2.
- **Empty `ProjectPayments`** (today's real state): gviz may return headers as a data row; loader requests `headers=1` and parser must return `[]` — test in Task 2.
- **Overpayment / split payments** (1,000 + 700, or 1,800): status `paid`, remaining `0`, never negative — test in Task 2.
- **Payment for unknown project id or apartment outside the building** (typo in sheet): ignored, doesn't inflate `collected` — test in Task 2.
- **Due date typed by Sheets as a date cell** (`Date(2026,9,25)` or `25/10/2026` or `25/10/26`): all parse to 25 Oct 2026; overdue only when strictly before today and not fully collected — test in Task 2.

---

### Task 1: Branch, ignore rules, and the two new sheet tabs

**Files:**
- Modify: `.gitignore` (create if missing): add `backups/` and `.superpowers/`
- External: spreadsheet `1_zdYPJNYSifPeQPI5CtqhfnvgzOFgxjOUe0jJDVzo1c`

**Interfaces:**
- Produces: tab `Projects` with header row `id | name | description | per_apartment | total_cost | due_date | status` and one data row (values in Global Constraints; description = `סיוד חדר המדרגות – תיקונים בגרם המדרגות, צבע כללי, צביעת המעקה וצבע ארונות העץ. זיפות הגג בזפת לבן – שטיפה, טיפול בחלקים רופפים, פינוי פסולת, שכבת פריימר וזיפות משוריין.`). Tab `ProjectPayments` with header row `project_id | apartment | amount | date | method` and no data rows. Columns `due_date` and `date` formatted as plain text (avoids locale date parsing).

- [ ] **Step 1:** `git checkout -b feature/projects-dashboard`; add `.gitignore` entries; `git status` shows neither `backups/` nor `.superpowers/`.
- [ ] **Step 2:** Authenticate the Google Sheets connector (`mcp__claude_ai_Google_Sheets__authenticate`), then add the two tabs at the end of the workbook with the contents above. Touch no other tab.
- [ ] **Step 3: Verify** — fetch `.../gviz/tq?tqx=out:csv&headers=1&sheet=Projects` and `...sheet=ProjectPayments`; expected: the header labels above (and the one project row). Re-download the five original tabs as CSV and `diff` against `backups/2026-10-18/*.csv`; expected: no differences.
- [ ] **Step 4: Commit** `git add .gitignore && git commit -m "chore: ignore local backups and brainstorm files"`

### Task 2: `js/projects.js` pure module + tests

**Files:**
- Create: `js/projects.js`
- Test: `tests/projects.test.js`

**Interfaces:**
- Produces (global `Projects` in browser; `module.exports = Projects` when `typeof module !== 'undefined'`):
  - `Projects.PROJECT_HEADERS = ['id','name','description','per_apartment','total_cost','due_date','status']`
  - `Projects.PAYMENT_HEADERS = ['project_id','apartment','amount','date','method']`
  - `Projects.hasHeaders(cols: string[], expected: string[]) -> boolean` — trimmed, case-insensitive match of the first `expected.length` labels.
  - `Projects.parseDate(value: string) -> Date|null` — accepts `d/m/yyyy`, `d/m/yy` (→ 20yy), `Date(y,m,d)` (m zero-based). Local midnight.
  - `Projects.parseProjects(raw: {cols, rows}) -> Project[]` where `Project = {id, name, description, perApartment: number, totalCost: number, dueDate: string, status: 'open'|'done'}`; `[]` on header mismatch; skips rows without `id`; status other than `done` → `open`.
  - `Projects.parsePayments(raw) -> Payment[]` where `Payment = {projectId, apartment: number, amount: number, date: string, method: 'cash'|'bit'|'paybox'}`; `[]` on header mismatch; skips rows with no `project_id` or non-positive amount; method lowercased, `פייבוקס`/`paybox`→`paybox`, `ביט`/`bit`→`bit`, anything else/empty → `cash`.
  - `Projects.summarize(project: Project, payments: Payment[], aptNumbers: number[]) -> Summary` where `Summary = {project, goal, collected, paidCount, aptCount, apartments: {[apt: number]: {status: 'paid'|'partial'|'unpaid', paid, remaining, payments: Payment[]}}}`. Only payments with matching `projectId` and `apartment ∈ aptNumbers` count. `goal = perApartment × aptCount`; `collected` = sum of counted amounts capped per apartment at `perApartment`; `remaining = max(0, perApartment − paid)`.
  - `Projects.isOverdue(summary: Summary, now: Date) -> boolean` — due date (date-only) strictly before `now`'s date and `collected < goal`.

- [ ] **Step 1: Write failing tests** in `tests/projects.test.js` using `node:test` + `node:assert/strict`, `const Projects = require('../js/projects.js')`:
  - `hasHeaders` true for `['ID ',' Name', ...]`; false for Payments' cols `['חודש','אמיר',...]`.
  - `parseProjects` on Payments-shaped raw → `[]`; on valid raw with the Global-Constraints row → one project with `perApartment === 1700`, `totalCost === 15340`, `status === 'open'`.
  - `parsePayments` on `{cols: PAYMENT_HEADERS, rows: []}` → `[]`; method mapping: `''→'cash'`, `'Bit'→'bit'`, `'פייבוקס'→'paybox'`.
  - `parseDate('25/10/2026')`, `parseDate('25/10/26')`, `parseDate('Date(2026,9,25)')` all → 2026-10-25; `parseDate('')` → `null`.
  - `summarize` with apts 1–9 and payments `[{apt 3, 1000}, {apt 3, 700}, {apt 5, 1800}, {apt 7, 500}, {apt 12, 1700}, {projectId 'other', apt 1, 1700}]` → apt 3 `paid`/remaining 0, apt 5 `paid`/remaining 0, apt 7 `partial`/remaining 1200, apt 1 `unpaid`, `paidCount === 2`, `collected === 1700+1700+500`, `goal === 15300`.
  - `isOverdue`: due 25/10/2026, `now` 2026-10-25 → false; `now` 2026-10-26 with collected < goal → true; fully collected → false.
- [ ] **Step 2:** `node --test tests/` → FAIL (module missing).
- [ ] **Step 3:** Implement `js/projects.js` per the Interfaces block (IIFE, same JSDoc style as `js/api.js`).
- [ ] **Step 4:** `node --test tests/` → all pass.
- [ ] **Step 5: Commit** `git add js/projects.js tests/ && git commit -m "feat: add projects parsing and status module"`

### Task 3: Data loading in `SheetsAPI`

**Files:**
- Modify: `js/api.js` (`CACHE_KEY`, `buildUrl`, `fetchSheet`, `fetchAllData`; add `processAnnouncement`)
- Modify: `index.html`, `resident.html` (add `<script src="js/projects.js">` before `js/api.js`)

**Interfaces:**
- Consumes: `Projects.parseProjects`, `Projects.parsePayments` (Task 2).
- Produces: `fetchAllData()` result gains `projects: Project[]`, `projectPayments: Payment[]`, `announcement: string` (empty string if none). New helper `fetchOptionalSheet(name: string, headers: number) -> Promise<{cols, rows}|null>` (catches errors → `null`). `buildUrl(sheetName, headers?)` appends `&headers=N` when given.

- [ ] **Step 1:** `CACHE_KEY = 'manzel_data_v5'`; add the optional fetch path; load `Projects` and `ProjectPayments` with `headers=1`, `Announcement` with `headers=0`, in the same `Promise.all` as existing tabs.
- [ ] **Step 2:** `processAnnouncement(raw)`: `''` if `raw` is null or has more than 2 columns (gviz fell back to `Payments`); otherwise the first non-empty cell of the first row that doesn't start with `http`.
- [ ] **Step 3: Verify** — `python3 -m http.server 8000`, open `http://localhost:8000`, in console: `sessionStorage.clear(); SheetsAPI.fetchAllData(true).then(d => console.log(d.projects, d.projectPayments, d.announcement))` → one project, `[]`, `'שנה טובה ומוצלחת'`. Existing page still renders fund 601.1 and building.
- [ ] **Step 4: Commit** `git commit -am "feat: load projects, project payments and announcement tabs"` (plus `git add` of HTML changes).

### Task 4: Main page polish (direction A)

**Files:**
- Modify: `index.html`, `js/app.js`, `css/styles.css`, `js/i18n.js`

**Interfaces:**
- Consumes: `appData.projects`, `appData.projectPayments`, `appData.announcement` (Task 3); `Projects.summarize`, `Projects.isOverdue` (Task 2).
- Produces: links `project.html?id=<project.id>` (consumed by Task 5). Shared helper `App`-private `getAptNumbers(floors) -> number[]` (flattened building apartments).
- New i18n keys (all 5 languages): `paidThisMonth` (`'שילמו החודש: {count} מתוך {total} דירות'`), `projects`, `projectDue` (`'עד {date}'`), `projectCollected` (`'{collected} מתוך {goal} ₪'`), `projectApartments` (`'{paid}/{total} דירות'`), `completedProjects`, `overdue`, `future`, `noExpenses`.

- [ ] **Step 1:** Announcement strip above the fund card (hidden when `announcement` is empty).
- [ ] **Step 2:** Fund card: `paidThisMonth` line + thin progress bar. Count = apartments whose current-month payment `amount !== null` (0 counts as paid); total = `getAptNumbers().length`.
- [ ] **Step 3:** Projects section (hidden if no projects): card per `open` project — name, `projectDue` (+ `overdue` badge when `isOverdue`), progress bar `collected/goal`, `projectCollected`, `projectApartments`, nine numbered dots (`--paid` green / `--partial` warning / `--unpaid` grey). Whole card is a link to `project.html?id=…`. `done` projects listed under a `completedProjects` row as compact links.
- [ ] **Step 4:** Building: legend (paid / notPaid / discount / future) and year in the section title; current-month box gets `payment-box--current` (outlined with `--color-primary`).
- [ ] **Step 5:** Expenses: replace the table with a list (`ul.expense-list`), order unchanged (newest first). Row: icon (`🧹` for types containing `מנקה`/`ניקוי`, `⚡` for `חשמל`, `🧾` otherwise), translated type, notes as secondary text, amount (`--color-success` when > 0). Keep row click → `expense.html` and keep pagination. Empty list → `noExpenses` (fixes the stuck "Loading…").
- [ ] **Step 6:** Replace the three spinners with shimmer skeleton blocks reusing `.skeleton` from `css/styles.css`.
- [ ] **Step 7: Verify** in the browser at 390px wide and desktop: Hebrew (RTL) and English (LTR), light and dark — announcement, `5 מתוך 9`-style count, project card with 0/9 dots and `0 מתוך 15,300 ₪`, legend, current month outlined, expense list with icons, no console errors.
- [ ] **Step 8: Commit** `git add index.html js/app.js css/styles.css js/i18n.js && git commit -m "feat: polish dashboard and add projects section"`

### Task 5: Project page

**Files:**
- Create: `project.html`, `js/project.js` (`ProjectPage` IIFE)
- Modify: `css/styles.css`, `js/i18n.js`

**Interfaces:**
- Consumes: `?id=` from Task 4 links; `SheetsAPI.fetchAllData`, `Projects.summarize`, `Projects.isOverdue`; display names via `data.residents[apt].displayName`, falling back to `data.payments.residents[apt-1]`, then `apartment N` — same rule as `App.createFloorElement`.
- New i18n keys: `projectNotFound`, `backHome`, `totalCost`, `remaining` (`'נותר {amount} ₪'`), `methodCash`, `methodBit`, `methodPaybox`, `paidOf` (`'{paid} מתוך {total} דירות שילמו'`).

- [ ] **Step 1:** `project.html` with the same header (back button, language switcher), theme toggle footer and script order as `resident.html` (+ `js/projects.js`, `js/project.js`).
- [ ] **Step 2:** Hero: name, description, due date with `overdue` badge, progress bar, `projectCollected`, `paidOf`, `totalCost` as secondary line, pay button → `payment.html`.
- [ ] **Step 3:** Apartment list in building order (top floor first): name, apartment number, status badge (`paid` / `partial` + `remaining` / `notPaid`), and each payment as `date · amount ₪ · method label`.
- [ ] **Step 4:** Unknown or missing id → `projectNotFound` message + `backHome` link to `index.html`.
- [ ] **Step 5: Verify** `project.html?id=roof-stairs-2026` (9 unpaid apartments, 0 / 15,300) and `project.html?id=nope` (not-found) in he + en, light + dark, 390px.
- [ ] **Step 6: Commit** `git add project.html js/project.js css/styles.css js/i18n.js && git commit -m "feat: add project detail page"`

### Task 6: Resident page — projects block + admin message

**Files:**
- Modify: `resident.html`, `js/resident.js`, `js/api.js` (`getResidentData`), `css/styles.css`, `js/i18n.js`

**Interfaces:**
- Consumes: `Projects.summarize` (Task 2), `data.projects` / `data.projectPayments` (Task 3).
- Produces: `getResidentData()` result gains `projects: Array<{project: Project, status, paid, remaining, payments: Payment[]}>` — every project where this apartment has `remaining > 0`, plus every `open` project.
- New i18n keys: `projectsSection`, `debtMessageProject` (he: `'עבור פרויקט "{name}" נותר לתשלום {amount} ₪'`).

- [ ] **Step 1:** In `getResidentData`, compute the apartment's entry per project via `Projects.summarize(project, data.projectPayments, aptNumbers)` where `aptNumbers` is the flattened `data.building` apartments.
- [ ] **Step 2:** Projects block under the owed cards (hidden if the list is empty): per project, name linking to `project.html?id=…`, status badge, remaining or paid date + method.
- [ ] **Step 3:** `generateDebtMessage`: after the last-year block, one `debtMessageProject` line per project with `remaining > 0` (blank line before the group). `setupActionButtons`: show buttons when `owed > 0 || lastYearOwed > 0 || any project remaining > 0`. Monthly debt figures unchanged.
- [ ] **Step 4: Verify** with admin mode on (`localStorage.setItem('manzel_admin','true')`): a resident with no monthly debt (apt 1) now shows the buttons, and the copied message contains `עבור פרויקט "זיפות גג + מדרגות" נותר לתשלום 1,700 ₪`; a resident with monthly debt keeps the existing lines unchanged above it. Check he + en.
- [ ] **Step 5: Commit** `git add resident.html js/resident.js js/api.js css/styles.css js/i18n.js && git commit -m "feat: show project dues on resident page and debt message"`

### Task 7: Docs + final check

**Files:**
- Modify: `CLAUDE.md` (sheets list gains `Projects`, `ProjectPayments`, `Announcement`; new module `Projects` / page `project.html`; cache key `manzel_data_v5`; tests via `node --test tests/`; gviz missing-tab fallback gotcha)

- [ ] **Step 1:** Update `CLAUDE.md`.
- [ ] **Step 2:** `node --test tests/` passes; click through index → project → back → resident → back in he/en/ar, light/dark; no console errors.
- [ ] **Step 3: Commit** `git add CLAUDE.md docs/ && git commit -m "docs: document projects feature"`
