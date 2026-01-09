/**
 * Resident Detail Page Logic
 * Shows payment history and amount owed for a specific resident
 */

const ResidentPage = (function() {
  let residentData = null;
  let currentYearIndex = 0;

  /**
   * Get URL parameters
   * @returns {Object} URL parameters
   */
  function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    return {
      name: params.get('name'),
      apt: params.get('apt')
    };
  }

  /**
   * Initialize the page
   */
  async function init() {
    const params = getUrlParams();

    if (!params.name) {
      window.location.href = 'index.html';
      return;
    }

    // Set up back button
    document.getElementById('backBtn').addEventListener('click', () => {
      window.location.href = 'index.html';
    });

    // Update header
    document.getElementById('residentName').textContent = params.name;
    document.getElementById('residentApt').textContent = params.apt || '-';

    try {
      // Fetch resident data
      residentData = await SheetsAPI.getResidentData(params.name);

      // Render the page
      renderOwedAmount(residentData.owed);
      renderLastYearOwed(residentData.lastYearOwed);
      renderPaymentHistory(residentData.payments, residentData.years);

    } catch (error) {
      console.error('Failed to load resident data:', error);
      showError();
    }
  }

  /**
   * Render the amount owed section
   * @param {number} owed - Amount owed
   */
  function renderOwedAmount(owed) {
    const owedCard = document.getElementById('owedCard');
    const owedAmount = document.getElementById('owedAmount');

    if (owed <= 0) {
      owedCard.classList.add('owed-card--paid');
      owedAmount.textContent = I18n.t('noDebt');
    } else {
      owedAmount.textContent = formatNumber(owed);
    }
  }

  /**
   * Render the last year owed section
   * @param {number} lastYearOwed - Amount owed from last year
   */
  function renderLastYearOwed(lastYearOwed) {
    const lastYearCard = document.getElementById('lastYearOwedCard');
    const lastYearAmount = document.getElementById('lastYearOwedAmount');

    if (lastYearOwed > 0) {
      lastYearCard.classList.remove('hidden');
      lastYearAmount.textContent = formatNumber(lastYearOwed);
    }
  }

  /**
   * Render payment history with year pagination
   * @param {Object} payments - Payment history { year: [12 months] }
   * @param {Array} years - Available years
   */
  function renderPaymentHistory(payments, years) {
    const loading = document.getElementById('historyLoading');
    const historyEl = document.getElementById('paymentHistory');

    loading.classList.add('hidden');
    historyEl.classList.remove('hidden');

    // If no years data, show empty state
    if (!years || years.length === 0) {
      historyEl.innerHTML = `<p class="text-center">${I18n.t('loading')}</p>`;
      return;
    }

    renderYearPage(payments, years, currentYearIndex);
  }

  /**
   * Render a single year's payments
   * @param {Object} payments - All payments data
   * @param {Array} years - Available years
   * @param {number} yearIndex - Index of year to display
   */
  function renderYearPage(payments, years, yearIndex) {
    const historyEl = document.getElementById('paymentHistory');
    historyEl.innerHTML = '';

    const now = new Date();
    const currentCalendarYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const year = years[yearIndex];
    const yearPayments = payments[year] || [];

    // Year header with pagination
    const yearHeader = document.createElement('div');
    yearHeader.className = 'year-header year-header--with-nav';

    // Newer year (lower index since years are sorted descending)
    const newerBtn = document.createElement('button');
    newerBtn.className = 'year-nav-btn';
    newerBtn.textContent = '‹';
    newerBtn.disabled = yearIndex <= 0;
    newerBtn.addEventListener('click', () => {
      if (currentYearIndex > 0) {
        currentYearIndex--;
        renderYearPage(payments, years, currentYearIndex);
      }
    });

    const yearText = document.createElement('span');
    yearText.textContent = year;

    // Older year (higher index)
    const olderBtn = document.createElement('button');
    olderBtn.className = 'year-nav-btn';
    olderBtn.textContent = '›';
    olderBtn.disabled = yearIndex >= years.length - 1;
    olderBtn.addEventListener('click', () => {
      if (currentYearIndex < years.length - 1) {
        currentYearIndex++;
        renderYearPage(payments, years, currentYearIndex);
      }
    });

    yearHeader.appendChild(newerBtn);
    yearHeader.appendChild(yearText);
    yearHeader.appendChild(olderBtn);
    historyEl.appendChild(yearHeader);

    // Create payment items for each month
    for (let i = 0; i < 12; i++) {
      const payment = yearPayments[i];

      const item = document.createElement('div');
      item.className = 'payment-item';

      // Month name
      const monthName = document.createElement('span');
      monthName.className = 'payment-item__month';
      monthName.setAttribute('data-i18n-month', i);
      monthName.textContent = I18n.getMonthName(i);

      // Status
      const status = document.createElement('span');
      status.className = 'payment-item__status';

      const indicator = document.createElement('span');
      indicator.className = 'payment-item__indicator';

      const statusText = document.createElement('span');

      const isFuture = (year > currentCalendarYear) || (year === currentCalendarYear && i > currentMonth);

      if (payment && payment.amount > 0) {
        indicator.classList.add('payment-item__indicator--paid');
        statusText.textContent = `${I18n.t('paid')} (${payment.amount} ₪)`;
      } else if (payment && payment.amount === 0) {
        indicator.classList.add('payment-item__indicator--zero');
        statusText.textContent = `${I18n.t('partial')} (0 ₪)`;
      } else if (isFuture) {
        indicator.classList.add('payment-item__indicator--unpaid');
        statusText.textContent = '-';
        statusText.style.color = 'var(--color-text-light)';
      } else {
        indicator.classList.add('payment-item__indicator--unpaid');
        statusText.textContent = I18n.t('notPaid');
      }

      status.appendChild(indicator);
      status.appendChild(statusText);

      item.appendChild(monthName);
      item.appendChild(status);

      historyEl.appendChild(item);
    }
  }

  /**
   * Format number with locale
   * @param {number} num - Number to format
   * @returns {string} Formatted number
   */
  function formatNumber(num) {
    return new Intl.NumberFormat('he-IL').format(num);
  }

  /**
   * Show error message
   */
  function showError() {
    const container = document.querySelector('.container');
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error';
    errorDiv.textContent = I18n.t('error');
    container.insertBefore(errorDiv, document.querySelector('.resident-header'));

    // Hide loading spinner
    document.getElementById('historyLoading').classList.add('hidden');
  }

  // Initialize on DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    // Small delay to ensure i18n is initialized
    setTimeout(init, 100);
  });

  // Public API
  return {
    init,
    getData: () => residentData
  };
})();
