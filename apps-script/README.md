# Admin web app (Google Apps Script)

The admin page (`admin/`) writes to the spreadsheet through this script. It runs as the spreadsheet owner and checks a PIN on every request.

- `Logic.gs`: pure logic (row lookup, row building, validation, PIN lockout). Unit-tested with `node --test tests/*.test.js`.
- `Code.gs`: the `doPost` web app that calls `SpreadsheetApp`.

## Deploy / update

1. Open the spreadsheet → **Extensions → Apps Script**.
2. Create `Logic.gs` and `Code.gs` with the contents of this folder (replace everything in each file).
3. **Project Settings** (gear icon):
   - Time zone: `(GMT+02:00) Jerusalem`
   - Script Properties → add `ADMIN_PIN` = the admin PIN. **Never commit the PIN to this repo.**
4. **Deploy → New deployment → Web app**: Execute as **Me**, Who has access **Anyone**. Approve Google's permission prompt.
5. Copy the `/exec` URL into `AdminAPI.ENDPOINT` in `js/admin-api.js`.

To update the code later, use **Deploy → Manage deployments → Edit → Version: New version**, so the `/exec` URL stays the same.

## Behavior

- Five wrong PINs lock the endpoint for 10 minutes, then 20, 40 … up to 24 hours. A correct PIN resets the lock. Lock state is in Script Property `ADMIN_LOCK`; delete that property to unlock by hand.
- `monthly` never overwrites a filled `Payments` cell, and fails with `missing_year` if the year's rows don't exist.
- `project` and `expense` append on the first empty row of column A. `expense` writes columns A–D only.
