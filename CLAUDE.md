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

**No build step, no linting, no tests configured.** Direct file editing and browser refresh.

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

### Pages
- `index.html` - Main dashboard with building visualization
- `resident.html` - Individual resident payment history
- `expense.html` - Expense details

## Data Source

Google Sheets API via Google Visualization API. Spreadsheet contains 4 sheets:
- `Payments` - Resident payment records by month/year
- `total` - Total maintenance fund amount
- `Expence` - Building expenses (note: typo is intentional, matches source)
- `building` - Floor/apartment layout

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
- Cache key: `manzel_data_v3`
- Force refresh available via `SheetsAPI.fetchData(true)`

### Accessibility
- ARIA roles on interactive elements
- `tabindex="0"` and keyboard handlers for custom clickable elements
