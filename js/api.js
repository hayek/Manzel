/**
 * Google Sheets API Integration
 * Fetches data from public Google Sheets
 */

const SheetsAPI = (function() {
  const SPREADSHEET_ID = '1_zdYPJNYSifPeQPI5CtqhfnvgzOFgxjOUe0jJDVzo1c';
  const CACHE_KEY = 'manzel_data_v4'; // Updated to include Residents table
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  /**
   * Build the Google Sheets API URL
   * @param {string} sheetName - Name of the sheet to fetch
   * @returns {string} API URL
   */
  function buildUrl(sheetName) {
    return `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
  }

  /**
   * Parse Google Visualization API response
   * @param {string} response - Raw response text
   * @returns {Object} Parsed data with cols and rows
   */
  function parseResponse(response) {
    // Google returns: google.visualization.Query.setResponse({...})
    // We need to extract the JSON object
    const jsonMatch = response.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);?$/);
    if (!jsonMatch) {
      throw new Error('Invalid response format');
    }

    const data = JSON.parse(jsonMatch[1]);

    if (data.status === 'error') {
      throw new Error(data.errors?.[0]?.message || 'API Error');
    }

    const table = data.table;
    const cols = table.cols.map(col => col.label || col.id);
    const rows = table.rows.map(row => {
      return row.c.map(cell => {
        if (cell === null) return null;
        // For date values, prefer the formatted string (f) over raw value (v)
        // Google Sheets returns dates as "Date(year,month,day)" in cell.v
        if (cell.v !== undefined && typeof cell.v === 'string' && cell.v.startsWith('Date(')) {
          return cell.f || cell.v;
        }
        return cell.v !== undefined ? cell.v : cell.f;
      });
    });

    return { cols, rows };
  }

  /**
   * Fetch data from a specific sheet
   * @param {string} sheetName - Name of the sheet
   * @returns {Promise<Object>} Parsed sheet data
   */
  async function fetchSheet(sheetName) {
    const url = buildUrl(sheetName);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const text = await response.text();
      return parseResponse(text);
    } catch (error) {
      console.error(`Error fetching sheet "${sheetName}":`, error);
      throw error;
    }
  }

  /**
   * Get cached data or fetch fresh
   * @returns {Promise<Object>} All sheet data
   */
  async function getCachedData() {
    const cached = sessionStorage.getItem(CACHE_KEY);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < CACHE_DURATION) {
        return data;
      }
    }
    return null;
  }

  /**
   * Save data to cache
   * @param {Object} data - Data to cache
   */
  function setCachedData(data) {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({
      data,
      timestamp: Date.now()
    }));
  }

  /**
   * Fetch all required data
   * @param {boolean} forceRefresh - Skip cache
   * @returns {Promise<Object>} All sheet data
   */
  async function fetchAllData(forceRefresh = false) {
    if (!forceRefresh) {
      const cached = await getCachedData();
      if (cached) return cached;
    }

    const [payments, total, expenses, building, residents] = await Promise.all([
      fetchSheet('Payments'),
      fetchSheet('total'),
      fetchSheet('Expence'),
      fetchSheet('building'),
      fetchSheet('Residents')
    ]);

    const data = {
      payments: processPayments(payments),
      total: processTotal(total),
      expenses: processExpenses(expenses),
      building: processBuilding(building),
      residents: processResidents(residents)
    };

    setCachedData(data);
    return data;
  }

  /**
   * Process payments data
   * @param {Object} raw - Raw sheet data
   * @returns {Object} Processed payments grouped by year
   */
  function processPayments(raw) {
    const { cols, rows } = raw;

    // Find year column index (usually last column named 'year')
    const yearColIndex = cols.findIndex(col => col && col.toLowerCase() === 'year');

    // Residents are columns between month (0) and year column, excluding year
    const residentCols = cols.slice(1, yearColIndex > 0 ? yearColIndex : cols.length);
    const residents = residentCols.filter(name => name && name.trim());

    // Initialize payments structure: { residentName: { year: [12 months] } }
    const payments = {};
    const years = new Set();

    residents.forEach(name => {
      payments[name] = {};
    });

    rows.forEach(row => {
      const month = row[0];
      if (!month) return;

      const year = yearColIndex > 0 ? row[yearColIndex] : new Date().getFullYear();
      if (!year) return;

      years.add(year);

      // Get month index (0-11) from the date
      let monthIndex = 0;
      if (typeof month === 'string') {
        // Google Sheets returns dates as "Date(year,month,day)" strings
        const dateMatch = month.match(/Date\(\d+,(\d+),\d+\)/);
        if (dateMatch) {
          monthIndex = parseInt(dateMatch[1], 10);
        } else {
          // Fallback: Parse Hebrew month abbreviations
          const hebrewMonths = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יונ', 'יול', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];
          monthIndex = hebrewMonths.findIndex(m => month.includes(m));
          if (monthIndex === -1) monthIndex = 0;
        }
      } else if (month instanceof Date || (typeof month === 'object' && month !== null)) {
        // Handle Date objects from Google Sheets
        monthIndex = new Date(month).getMonth();
      }

      residents.forEach((name, index) => {
        if (!payments[name][year]) {
          payments[name][year] = Array(12).fill(null);
        }
        const value = row[index + 1];
        payments[name][year][monthIndex] = {
          month: monthIndex,
          amount: value !== null ? Number(value) : null
        };
      });
    });

    console.log('Processed payments:', { residents, payments, years: Array.from(years) });
    return {
      residents,
      payments,
      years: Array.from(years).sort((a, b) => b - a) // Sort descending (newest first)
    };
  }

  /**
   * Process total fund data
   * @param {Object} raw - Raw sheet data
   * @returns {number} Total amount
   */
  function processTotal(raw) {
    const { rows } = raw;
    // Assuming total is in the first cell or a specific location
    // We'll look for a number value
    for (const row of rows) {
      for (const cell of row) {
        if (typeof cell === 'number') {
          return cell;
        }
      }
    }
    return 0;
  }

  /**
   * Process expenses data
   * Columns: סוג (Type), כמות (Amount), קבלה (Receipt), הערות (Notes)
   * @param {Object} raw - Raw sheet data
   * @returns {Array} Expenses list
   */
  function processExpenses(raw) {
    const { cols, rows } = raw;

    return rows.map(row => ({
      type: row[0] || '',
      price: row[1] || 0,
      receipt: row[2] || '',
      notes: row[3] || ''
    })).filter(expense => expense.type).reverse();
  }

  /**
   * Process residents data
   * Columns: family name, first name, property owner
   * @param {Object} raw - Raw sheet data
   * @returns {Object} Map of payment column name to resident info
   */
  function processResidents(raw) {
    const { rows } = raw;
    const residentsMap = {};

    rows.forEach(row => {
      const familyName = row[0] ? String(row[0]).trim() : '';
      const firstName = row[1] ? String(row[1]).trim() : '';
      const propertyOwner = row[2] ? String(row[2]).trim() : '';

      // The key should match the payment column name
      // Use family name as key if available, otherwise first name
      const paymentKey = familyName || firstName;

      if (paymentKey) {
        residentsMap[paymentKey] = {
          familyName,
          firstName,
          propertyOwner,
          // Display name: use family name if available, otherwise first name
          displayName: familyName || firstName
        };
      }
    });

    return residentsMap;
  }

  /**
   * Process building layout data
   * Building sheet has apartment numbers (1-9) arranged by floor
   * @param {Object} raw - Raw sheet data
   * @returns {Array} Building floors with apartment numbers
   */
  function processBuilding(raw) {
    const { cols, rows } = raw;

    const floors = [];

    rows.forEach((row, index) => {
      // Each row is a floor, cells are apartment numbers
      const apartments = row
        .filter(cell => cell !== null && cell !== undefined)
        .map(cell => Number(cell));

      if (apartments.length > 0) {
        floors.push({
          number: rows.length - index - 1, // Top floor first in sheet, start from 0
          apartments: apartments
        });
      }
    });

    return floors;
  }

  /**
   * Get payment data for a specific resident
   * @param {string} residentName - Name of the resident
   * @returns {Promise<Object>} Resident payment data with all years
   */
  async function getResidentData(residentName) {
    const data = await fetchAllData();
    const residentPayments = data.payments.payments[residentName] || {};
    const years = data.payments.years || [];
    const residentInfo = data.residents[residentName] || {};

    // Calculate amount owed (unpaid months for current year up to current month)
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-11
    const monthlyAmount = 50;

    let owed = 0;
    const currentYearPayments = residentPayments[currentYear] || [];

    for (let i = 0; i <= currentMonth; i++) {
      const payment = currentYearPayments[i];
      if (!payment || payment.amount === null || payment.amount === 0) {
        owed += monthlyAmount;
      } else if (payment.amount < monthlyAmount) {
        owed += monthlyAmount - payment.amount;
      }
    }

    // Calculate last year owed (all 12 months)
    const lastYear = currentYear - 1;
    let lastYearOwed = 0;
    const lastYearPayments = residentPayments[lastYear] || [];

    for (let i = 0; i < 12; i++) {
      const payment = lastYearPayments[i];
      if (!payment || payment.amount === null || payment.amount === 0) {
        lastYearOwed += monthlyAmount;
      } else if (payment.amount < monthlyAmount) {
        lastYearOwed += monthlyAmount - payment.amount;
      }
    }

    return {
      name: residentName,
      payments: residentPayments, // { year: [12 months] }
      years,
      owed,
      lastYearOwed,
      propertyOwner: residentInfo.propertyOwner || ''
    };
  }

  // Public API
  return {
    fetchAllData,
    getResidentData,
    SPREADSHEET_ID
  };
})();
