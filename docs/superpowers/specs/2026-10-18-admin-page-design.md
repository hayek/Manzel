# Admin page — design

Date: 2026-10-18
Status: draft for approval

## Intent

A convenience page at `https://hayek.github.io/Manzel/admin` where Amir, usually on his phone, records:

1. a **monthly** maintenance payment (`Payments` tab),
2. a **project** payment (`ProjectPayments` tab),
3. an **expense** (`Expence` tab),

without opening Google Sheets. The Google Sheet stays the source of truth and Amir keeps editing it by hand, so the admin page must work against whatever the sheet currently contains. It must not assume it wrote every row.

## Goals

- `/admin` is protected by a 4-digit PIN chosen by Amir (given in chat; **never written in the repo**).
- Each action writes exactly one logical change to the sheet and reports what it wrote.
- After a successful save, the public site on the same device shows the change right away (its 5-minute cache is cleared). Other devices pick it up within 5 minutes.
- Mobile-first, in the existing visual language, light/dark, RTL.

## Non-goals

- Editing or deleting existing entries. Mistakes are fixed in the sheet by hand.
- Multiple admins, user accounts, audit logs.
- Changing the Glide app.
- Recording income other than resident payments (the rare positive rows in `Expence` stay manual).

## Anti-goals (failure even if it "works")

- Anyone who reads the public GitHub repo can write to the sheet. **The PIN must never appear in the repo or in the site's JS.**
- Overwriting a monthly cell that already has a value, or writing into the wrong row or column (wrong month, year or apartment).
- Breaking existing tabs, their formatting, the Sheets table on `Payments`, or Glide.
- Changing the fund total's value as a side effect of the range fix (see below).

## How it works (Claude's call; Amir did not object)

```
admin page (static, GitHub Pages) --POST JSON {pin, action, ...}--> Google Apps Script web app (bound to the spreadsheet, runs as Amir) --> sheet
```

- **Apps Script web app**, container-bound to the spreadsheet (Extensions → Apps Script). Deployed as a web app: *Execute as: me*, *Who has access: anyone*. The web app URL is a constant in the admin page JS. The URL being public is fine, because every request needs the PIN.
- **PIN storage:** the script compares against a Script Property `ADMIN_PIN`, set once in the Apps Script project settings. The value is never written into any repo file, including this spec and the plan. The script source lives in the repo at `apps-script/` (no PIN in it) and is copied into the Apps Script editor.
- **Brute-force slowdown:** after 5 wrong PINs within 10 minutes, the script rejects *all* requests for 10 minutes (CacheService counter; Apps Script has no client IP). Accepted risk: an attacker could lock Amir out for 10 minutes.
- **Request format:** `fetch(url, { method: 'POST', body: JSON.stringify(payload) })` with no custom headers. That makes it a "simple" CORS request (text/plain), so Apps Script needs no preflight. The response is JSON `{ ok: true, message, ... }` or `{ ok: false, error }`.
- **Google's permission prompt:** the first deploy asks Amir to authorize the script on his account. **Amir clicks "Allow" himself.** Claude never grants OAuth consent.

## Actions

### `verify`
Checks the PIN only. Used by the PIN screen.

### `monthly` — `{ apartment, year, months: [0..11], amount = 50 }`
- Apartment N maps to column N+1 (B–J), the same convention the site uses (`Payments` header order = apartments 1..9).
- Row lookup: the row whose column A month (a Date cell, displayed " mmm"; also accept the Hebrew abbreviation text as a fallback) equals the month **and** whose `year` column (located by header text `year`) equals the year.
- **Never overwrite:** a month whose cell is non-empty is skipped and reported back ("already recorded: Jun, Jul").
- **Year missing** (e.g. the first 2027 payment): return an error asking Amir to add that year's 12 rows in the sheet. Inserting rows inside the `Payments` Sheets table automatically is risky, and it happens once a year.
- **Yearly shortcut** in the UI: selects Jan–Nov at 50 and Dec at **0**. This matches how the sheet already records the 550 ₪ yearly discount (e.g. 2026, apartments 1–2). The script receives it as two writes or a per-month amount map; that's the builder's choice.
- Amount defaults to 50 and is editable (partial payments exist in the data and the site already handles them).

### `project` — `{ projectId, apartment, amount, date, method }`
- Appends `[project_id, apartment, amount, date, method]` to `ProjectPayments` on the first row whose column A is empty.
- `date` is written as **text** `dd/mm/yyyy` (the column is plain text; the spreadsheet locale is US, so real dates would display m/d).
- `method` ∈ `cash | bit | paybox`; defaults to cash.
- The UI pre-fills the amount with the project's `per_apartment` minus what that apartment already paid, using the existing `Projects.summarize`.

### `expense` — `{ type, amount, date, receipt }`
- Appends to `Expence` on the **first row whose column A (type) is empty**. Rows 240+ are pre-formatted but empty, so `getLastRow()` is wrong here.
- Column B = **negative** amount (Amir types a positive number). Column C = receipt URL (optional). Column D = the date as a **real Date** (the column is date-formatted `" d/m/yy"`, matching existing rows).
- Columns E+ (e.g. the electricity number in G) are never touched.
- UI: a type field with suggestions from existing types (מנקה, חשמל, …), amount, date (today), receipt link.

## Fund total range fix (one-time, touches one existing formula)

`total!A2` is currently `=SUM(Payments!B2:J49)+SUM(Expence!B2:B265)`. With ~238 expense rows, it stops counting new expenses after about 26 more. 2027 payment rows would fall outside `B2:J49`.

- Change it to open-ended ranges: `=SUM(Payments!B2:J)+SUM(Expence!B2:B)`.
- **Verify the displayed total is identical before and after (601.1 today).** If it differs, revert and stop.
- Glide reads the value, not the formula, so it's unaffected.

## Admin page UX

- `admin/index.html` (so `/Manzel/admin` works on GitHub Pages), with `<meta name="robots" content="noindex">`, same header (back + language), same footer/theme.
- **PIN screen:** a 4-digit numeric input (`inputmode="numeric"`) that is verified with the script. On success the PIN is kept in `sessionStorage` for the tab session. Wrong PIN → message. Locked → "try again in 10 minutes".
- **Three segments:** Monthly / Project / Expense (segmented control).
  - **Monthly:** apartment picker (9 buttons showing names), year (current by default), 12 month chips. Months already paid are shown filled and disabled (from the current public data). "Whole year (550)" shortcut. Amount field (default 50). Save.
  - **Project:** project picker (open projects), apartment picker showing each apartment's remaining amount, amount (pre-filled), date (today), method (cash / bit / paybox; cash selected). Save.
  - **Expense:** type with suggestions, amount, date (today), receipt link (optional). Save.
- After save: a success message with what was written ("Apt 3 · Oct 2026 · 50 ₪"), the form resets, the public-data cache is cleared, and data is refetched so the "already paid" states update.
- Errors from the script are shown verbatim in a red banner; nothing is retried automatically.
- All new strings in all 5 languages (repo convention).

## Testing approach

- The sheet-logic helpers (row lookup, month matching, first-empty-row, row building, PIN/lockout decision) live in a plain file (e.g. `apps-script/Logic.gs`). It exports via `module.exports` when `module` exists, so Node tests can load it, and it stays valid Apps Script.
- The thin `Code.gs` (`doPost`, SpreadsheetApp calls) is verified end to end against the real sheet: one test write per action, each checked through gviz and then **removed by hand-equivalent cleanup** (blank the monthly cell, delete the appended rows). Re-diff all tabs against a fresh backup taken right before testing.

## Decided by Claude (flag if you disagree)

- Google Apps Script as the write backend; PIN stored in Script Properties, not in the repo or site.
- Global 10-minute lockout after 5 wrong PINs.
- No overwriting monthly cells; no automatic creation of a new year's rows.
- Yearly shortcut = Jan–Nov 50 + Dec 0.
- Widen the fund-total formula ranges (value verified unchanged).
- Expense amounts entered positive, stored negative; expense dates as real dates, project dates as text.
- No free-text notes for expenses: column D (headed הערות) holds the date in practice.

## Left to the builder

Visual details, exact file split, how the yearly shortcut is sent, how the Apps Script source is pasted into the editor, i18n wording.
