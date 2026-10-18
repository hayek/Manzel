# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Manzel is a web-based building management system for residential properties, handling payments and expenses. It's a zero-dependency single-page application using vanilla HTML/CSS/JavaScript with data sourced from Google Sheets.

## Development Commands

```bash
# Start local development server
python3 -m http.server 8000

# Alternative
npx http-server
```

Then open `http://localhost:8000` in your browser.

**No build step, no linting.** Direct file editing and browser refresh.

```bash
# Unit tests for the pure data modules (Node 22 built-in runner, no dependencies)
node --test tests/*.test.js
```

## Architecture

### Data Flow
```
User Action → Page Module → SheetsAPI → Google Sheets
                  ↓
            DOM Manipulation
                  ↓
            I18n Translation
```

### Module Pattern
All JavaScript modules use IIFE (Immediately Invoked Function Expression) for encapsulation:
```javascript
const ModuleName = (function() {
  // Private variables/functions
  return { /* Public API */ };
})();
```

### Key Modules
- **SheetsAPI** (`js/api.js`) - Google Sheets integration with 5-minute session cache
- **I18n** (`js/i18n.js`) - Internationalization (5 languages: Hebrew, English, Arabic, Russian, Ukrainian)
- **App** (`js/app.js`) - Main dashboard page logic
- **ResidentPage** (`js/resident.js`) - Resident detail view
- **ExpensePage** (`js/expense.js`) - Expense detail view
- **Projects** (`js/projects.js`) - Pure parsing/status logic for building projects (Node-testable; shared by all pages)
- **ProjectPage** (`js/project.js`) - Project detail view

### Pages
- `index.html` - Main dashboard with building visualization
- `resident.html` - Individual resident payment history
- `expense.html` - Expense details
- `payment.html` - Payment methods and options (BIT, Paybox, cash)
- `project.html?id=<project id>` - Building project: collected vs. goal and per-apartment payments

## Data Source

Google Sheets API via Google Visualization API. The site reads these sheets:
- `Payments` - Resident payment records by month/year
- `total` - Total maintenance fund amount
- `Expence` - Building expenses (note: typo is intentional, matches source)
- `building` - Floor/apartment layout
- `Residents` - Apartment details: apartment number, family name, first name, property owner, phone
- `Projects` - One row per building project: `id | name | description | per_apartment | total_cost | due_date | status` (`open`/`done`)
- `ProjectPayments` - One row per payment: `project_id | apartment | amount | date | method` (`cash`/`bit`/`paybox`, empty = cash; split payments add up)

The spreadsheet is also connected to a Glide app - never modify existing tabs.

**gviz gotcha:** requesting a tab that doesn't exist silently returns the *first* tab (`Payments`). Optional tabs are loaded with `fetchOptionalSheet` and validated with `Projects.hasHeaders`, so a missing tab yields empty data instead of garbage.

Project money is separate from the maintenance fund: it never affects the total, expenses, or monthly debt.

## Key Conventions

### Internationalization
- Use `data-i18n` attributes for translatable text
- Translations defined in `js/i18n.js` for all 5 languages
- RTL support for Hebrew and Arabic via CSS direction properties

### CSS
- CSS Variables for theming
- BEM-like naming (`.floor__apartments`, `.payment-box--paid`)
- Mobile-first responsive design
- Use `margin-inline-start`/`end` for RTL compatibility
- `.hidden` utility class for visibility toggling

### Number/Currency Formatting
- Uses `Intl.NumberFormat` with Hebrew locale
- Currency: Israeli Shekel (₪)

### Caching
- Session storage with 5-minute TTL
- Cache key: `manzel_data_v6` (bump when the cached data shape changes)
- Force refresh available via `SheetsAPI.fetchAllData(true)`

### Theming
- Light/Dark/Auto theme support via `data-theme` attribute on `<html>`
- Theme preference stored in `localStorage` (`manzel_theme`)
- Auto mode respects system preference via `prefers-color-scheme`
- Theme toggle component in footer with dropdown menu

### UI Components
- **Language Switcher** - Dropdown in header row with flag-style button and listbox menu
- **Theme Toggle** - Footer component for light/dark/auto theme selection
- Both use ARIA attributes (`aria-haspopup`, `aria-expanded`, `role="listbox"`)

### Accessibility
- ARIA roles on interactive elements
- `tabindex="0"` and keyboard handlers for custom clickable elements
- Language and theme dropdowns with proper listbox semantics

### Admin Mode
- Hidden admin mode enabled via browser console: `localStorage.setItem('manzel_admin', 'true')`
- Shows action buttons on resident page when debt exists:
  - Copy debt message (localized, includes unpaid months and link)
  - Send via WhatsApp (uses phone from Residents sheet)
  - Buttons also appear when the apartment owes money for a project; each project due is its own message line
