# Dashboard polish + building projects — design

Date: 2026-10-18
Status: draft for approval

## Intent

Two things, delivered together:

1. **Polish the main page** (`index.html`, live at https://hayek.github.io/Manzel/index.html). Nothing is broken; it should simply feel more informative and finished.
2. **Building projects**: one-off building jobs paid for by residents as a **separate pot of money**, independent of the monthly 50 ₪ maintenance fund. The first project is stairwell painting + roof waterproofing ("זיפות גג+מדרגות"): 15,340 ₪ incl. VAT, **1,700 ₪ per apartment**, 9 apartments. More projects will follow, so the model must support many.

The site is how neighbors see who has paid. The admin (Amir) records payments in the Google Sheet; the site is read-only.

## Goals

- Every apartment owes the **same fixed amount** per project.
- Each payment records **amount, date, and method** (cash / bit / Paybox). Empty method = cash.
- Neighbors can see, per project: collected vs. goal, how many apartments paid, and who paid.
- Project money never affects the maintenance fund total, the expenses list, or monthly debt.
- Main page follows "Direction A" (chosen in a mockup review): same single-page order as today, polished.

## Non-goals

- Tracking money going **out** of a project (the contractor is paid in full; revisit only if needed).
- Writing to Google Sheets from the site, or any login.
- Different amounts per apartment.
- Changes to the Glide app or to the existing tabs it uses.

## Anti-goals (failure even if it "works")

- Breaking or altering any existing sheet/tab, or the Glide app connected to the spreadsheet.
- Showing **wrong** project numbers (worse than showing none).
- Mixing project money into the fund total or monthly debt.
- Committing personal data (phone numbers in the backup) to the public GitHub repo.

## Constraints

- Zero-dependency vanilla HTML/CSS/JS, IIFE modules, no build step (see `CLAUDE.md`).
- Data is read through the public gviz endpoint. **Gotcha:** requesting a tab name that doesn't exist silently returns the *first* tab (`Payments`). Loaders for new tabs must validate the header row and treat a mismatch as "no data".
- All new UI text in all 5 languages (he, en, ar, ru, uk); RTL-safe CSS (`margin-inline-*`); light/dark themes via existing CSS variables.
- Cache key `manzel_data_v4` must be bumped (new data shape) so old cached sessions don't break.
- Backup of the full spreadsheet taken before any sheet changes: `backups/2026-10-18/` (xlsx of all 7 tabs + per-tab CSVs). `backups/` and `.superpowers/` go in `.gitignore`.

## Data model (new tabs; existing tabs untouched)

### Tab `Projects` — one row per project

| Column (header, exact) | Example | Notes |
|---|---|---|
| `id` | `roof-stairs-2026` | Short stable key used in URLs and to link payments |
| `name` | `זיפות גג + מדרגות` | Display name (Hebrew; shown as-is in all languages) |
| `description` | `סיוד חדר מדרגות…; זיפות הגג בזפת לבן…` | Free text, optional |
| `per_apartment` | `1700` | ₪ owed by each apartment |
| `total_cost` | `15340` | Contractor price incl. VAT, informational |
| `due_date` | `25/10/2026` | dd/mm/yyyy (first project: next Sunday, per Amir) |
| `status` | `open` | `open` or `done` |

### Tab `ProjectPayments` — one row per payment (starts empty: nobody has paid yet)

| Column (header, exact) | Example | Notes |
|---|---|---|
| `project_id` | `roof-stairs-2026` | Matches `Projects.id` |
| `apartment` | `3` | Apartment number 1–9 |
| `amount` | `1700` | ₪; partial payments allowed (multiple rows add up) |
| `date` | `20/10/2026` | dd/mm/yyyy |
| `method` | `bit` | `cash` / `bit` / `paybox`; empty → cash |

**Debt rule (Claude's call):** an apartment's outstanding project amount (`per_apartment − sum paid`) is shown wherever it applies — resident page, admin message, project page — **regardless of `status` or `due_date`**, from the day the project row exists. `status` only controls where the project appears on the main page (`open` = full card, `done` = collapsed "completed" row). `due_date` only drives the "overdue" badge.

An apartment is **paid** when its summed amount ≥ `per_apartment`, **partial** when 0 < sum < `per_apartment`, **unpaid** at 0. Goal shown on the site = `per_apartment × number of apartments` (from the `building` tab); `total_cost` is shown as secondary info.

Claude creates both tabs via the Google Sheets connector (user approved), with headers, the first project row, and an empty payments tab.

## The main page (Direction A)

Top to bottom:

1. **Header** unchanged (address + language switcher).
2. **Announcement strip** — text from the existing `Announcement` tab (cell A1 only; the Glide link in A2 is ignored). Hidden when empty.
3. **Fund card** — total + pay button as today, plus "Paid this month: N of 9 apartments" with a small progress bar (count of apartments with a payment ≥ 0 recorded for the current month; 0 = yearly discount counts as paid).
4. **Projects section** — one card per `open` project: name, due date, progress bar (collected / goal), "N/9 apartments", nine numbered dots (green paid, half/amber partial, grey unpaid). Card links to `project.html?id=…`. `done` projects collapse into a small "completed" row below (still linkable). Section hidden when there are no projects.
5. **Building** — as today, plus: a color legend (paid / unpaid / discount / future), the current month's box outlined, and the year in the section title.
6. **Expenses** — table becomes a cleaner list, **in sheet order, newest first, not grouped by month** (Claude's call: the dates in the notes column are hand-typed and sometimes wrong or out of order, e.g. 2023 rows typed as `/26`, bills dated by bill date, pre-entered future cleaner rows; grouping/subtotals would show misleading numbers). Each row: icon per known expense type (🧹 מנקה, ⚡ חשמל, a generic icon otherwise), name, date (shown as typed in notes, if present), amount. Income rows (positive amounts, e.g. `שארית קופה 2022`) shown in green, expenses in the usual color. Tapping a row opens `expense.html` as today. Pagination stays (by rows, ~10 per page) or becomes "show more" — builder's call.
   - The empty-state bug (shows "Loading…" forever when there are no expenses) is fixed with a proper empty message.
7. **Loading**: spinners replaced with the shimmer skeleton style already used on `resident.html`.

## Project page (`project.html`, new)

- Back button + language switcher (same header as `resident.html`).
- Hero: project name, description, due date (marked "overdue" if past and not fully collected), collected / goal with progress bar, "N of 9 apartments paid".
- List of all 9 apartments (display names from `Residents`, as elsewhere): status badge (paid / partial with remaining amount / unpaid), and for each payment its date, amount, and method icon/label.
- Pay button linking to `payment.html` (existing payment methods page).
- Unknown/missing `id` → friendly "project not found" with a link home.

## Resident page additions

- A **Projects** block listing each project where this apartment still owes, or every `open` project, with that apartment's status: paid (date + method) or amount still owed.
- **Admin debt message** (copy / WhatsApp): adds a separate line per project with an outstanding amount ("Roof + stairs project: 1,700 ₪"). Shown when there's monthly debt *or* project debt; the admin buttons' visibility rule extends to "any debt". Monthly debt amounts stay unchanged.

## Code shape (guidance, not prescriptive)

- `SheetsAPI.fetchAllData` additionally loads `Projects`, `ProjectPayments`, `Announcement`; each new loader is fault-tolerant (missing tab / header mismatch / fetch error → empty result, never a failed page).
- A small helper computes per-project, per-apartment status so the main page, project page, and resident page share one source of truth.
- New page module `js/project.js` (`ProjectPage` IIFE), following `resident.js` patterns.
- New i18n keys for all 5 languages.

## Decided by Claude (flag if you disagree)

- Two new tabs (`Projects`, `ProjectPayments`) rather than columns in existing tabs, to keep Glide and current tabs untouched.
- Project names display in Hebrew in every language (they're free text from the sheet).
- Finished projects collapse into a "completed" row rather than disappearing.
- Shimmer loading on the main page.
- Expenses are **not** grouped by month (unreliable hand-typed dates); sheet order, with date per row and income in green.
- Project debt shows from day one regardless of status/due date; `status` only affects main-page placement.
- `backups/` is git-ignored because it contains residents' phone numbers.

## Left to the builder

Exact visual styling within the existing design language, icons, pagination vs. "show more", file/function names, i18n wording.
