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

      // Update header with full name from Residents sheet
      renderResidentName(residentData.familyName, residentData.firstName);

      // Render the page
      renderPropertyOwner(residentData.propertyOwner);
      renderOwedAmount(residentData.owed, residentData.payments);
      renderLastYearOwed(residentData.lastYearOwed, residentData.payments);
      renderPaymentHistory(residentData.payments, residentData.years);

      // Set up action buttons for debt message (copy and WhatsApp)
      setupActionButtons();

    } catch (error) {
      console.error('Failed to load resident data:', error);
      showError();
    }
  }

  /**
   * Render resident name (family + first name)
   * @param {string} familyName - Family name
   * @param {string} firstName - First name
   */
  function renderResidentName(familyName, firstName) {
    const nameEl = document.getElementById('residentName');
    const skeletonName = document.getElementById('skeletonName');

    // Build full name: family name + first name
    const parts = [familyName, firstName].filter(n => n && n.trim());
    if (parts.length > 0) {
      nameEl.textContent = parts.join(' ');
    }

    // Hide skeleton, show name
    if (skeletonName) skeletonName.classList.add('hidden');
    nameEl.classList.remove('hidden');
  }

  /**
   * Render property owner info
   * @param {string} propertyOwner - Property owner name
   */
  function renderPropertyOwner(propertyOwner) {
    const ownerRow = document.getElementById('propertyOwnerRow');
    const ownerEl = document.getElementById('propertyOwner');

    if (propertyOwner && propertyOwner.trim()) {
      ownerRow.classList.remove('hidden');
      ownerEl.textContent = propertyOwner;
    }
  }

  /**
   * Render the amount owed section
   * @param {number} owed - Amount owed
   * @param {Object} payments - Payment history { year: [12 months] }
   */
  function renderOwedAmount(owed, payments) {
    const owedCard = document.getElementById('owedCard');
    const owedAmount = document.getElementById('owedAmount');
    const owedCurrency = owedAmount.nextElementSibling;
    const owedLabel = owedCard.querySelector('.owed-card__label');
    const owedAmountContainer = owedCard.querySelector('.owed-card__amount');

    // Hide skeletons
    owedCard.querySelectorAll('.skeleton').forEach(el => el.classList.add('hidden'));
    owedCard.classList.remove('owed-card--loading');

    // Show real content
    if (owedLabel) owedLabel.classList.remove('hidden');
    if (owedAmountContainer) owedAmountContainer.classList.remove('hidden');

    if (owed <= 0) {
      owedCard.classList.add('owed-card--paid');
      owedAmount.textContent = I18n.t('noDebt');
      if (owedCurrency) owedCurrency.style.display = 'none';
    } else {
      owedAmount.textContent = formatNumber(owed);

      // Show unpaid months for current year
      const currentYear = new Date().getFullYear();
      const currentMonth = new Date().getMonth();
      const yearPayments = payments[currentYear] || [];
      const monthlyAmount = 50;

      const unpaidMonths = [];
      for (let i = 0; i < currentMonth; i++) {
        const payment = yearPayments[i];
        // 0 means discount (paid yearly), so skip it
        if (!payment || payment.amount === null) {
          unpaidMonths.push(I18n.getMonthName(i));
        } else if (payment.amount > 0 && payment.amount < monthlyAmount) {
          unpaidMonths.push(I18n.getMonthName(i) + ' (' + I18n.t('partial') + ')');
        }
      }

      if (unpaidMonths.length > 0) {
        const monthsList = document.createElement('p');
        monthsList.className = 'owed-card__months';
        monthsList.textContent = unpaidMonths.join(', ');
        owedCard.appendChild(monthsList);
      }
    }
  }

  /**
   * Render the last year owed section
   * @param {number} lastYearOwed - Amount owed from last year
   * @param {Object} payments - Payment history { year: [12 months] }
   */
  function renderLastYearOwed(lastYearOwed, payments) {
    const lastYearCard = document.getElementById('lastYearOwedCard');
    const lastYearAmount = document.getElementById('lastYearOwedAmount');

    if (lastYearOwed > 0) {
      lastYearCard.classList.remove('hidden');
      lastYearAmount.textContent = formatNumber(lastYearOwed);

      // Show unpaid months for last year
      const lastYear = new Date().getFullYear() - 1;
      const yearPayments = payments[lastYear] || [];
      const monthlyAmount = 50;

      const unpaidMonths = [];
      for (let i = 0; i < 12; i++) {
        const payment = yearPayments[i];
        // 0 means discount (paid yearly), so skip it
        if (!payment || payment.amount === null) {
          unpaidMonths.push(I18n.getMonthName(i));
        } else if (payment.amount > 0 && payment.amount < monthlyAmount) {
          unpaidMonths.push(I18n.getMonthName(i) + ' (' + I18n.t('partial') + ')');
        }
      }

      if (unpaidMonths.length > 0) {
        const monthsList = document.createElement('p');
        monthsList.className = 'owed-card__months';
        monthsList.textContent = unpaidMonths.join(', ');
        lastYearCard.appendChild(monthsList);
      }
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
        indicator.classList.add('payment-item__indicator--discount');
        indicator.textContent = '★';
        statusText.textContent = I18n.t('discount');
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
   * Get unpaid months for a given year
   * @param {Array} yearPayments - Payment data for the year
   * @param {number} monthLimit - Number of months to check (12 for past year, current month for current year)
   * @returns {Array} List of unpaid month names
   */
  function getUnpaidMonthsList(yearPayments, monthLimit) {
    const monthlyAmount = 50;
    const unpaidMonths = [];

    for (let i = 0; i < monthLimit; i++) {
      const payment = yearPayments[i];
      if (!payment || payment.amount === null) {
        unpaidMonths.push(I18n.getMonthName(i));
      } else if (payment.amount > 0 && payment.amount < monthlyAmount) {
        unpaidMonths.push(I18n.getMonthName(i) + ' (' + I18n.t('partial') + ')');
      }
    }

    return unpaidMonths;
  }

  /**
   * Generate the debt message text
   * @returns {string} The formatted debt message
   */
  function generateDebtMessage() {
    if (!residentData) return '';

    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();
    const lastYear = currentYear - 1;

    const lines = [];

    // Greeting
    lines.push(I18n.t('debtMessageGreeting'));
    lines.push('');
    lines.push(I18n.t('debtMessageIntro'));
    lines.push('');

    // Current year debt
    if (residentData.owed > 0) {
      const yearPayments = residentData.payments[currentYear] || [];
      const unpaidMonths = getUnpaidMonthsList(yearPayments, currentMonth);

      let currentYearLine = I18n.t('debtMessageCurrentYear')
        .replace('{amount}', formatNumber(residentData.owed))
        .replace('{year}', currentYear);

      lines.push(currentYearLine);

      if (unpaidMonths.length > 0) {
        lines.push(I18n.t('debtMessageMonths').replace('{months}', unpaidMonths.join(', ')));
      }
    }

    // Last year debt
    if (residentData.lastYearOwed > 0) {
      lines.push('');
      const yearPayments = residentData.payments[lastYear] || [];
      const unpaidMonths = getUnpaidMonthsList(yearPayments, 12);

      // Use different message if there's no current year debt
      const lastYearKey = residentData.owed > 0 ? 'debtMessageLastYear' : 'debtMessageLastYearOnly';
      let lastYearLine = I18n.t(lastYearKey)
        .replace('{amount}', formatNumber(residentData.lastYearOwed))
        .replace('{year}', lastYear);

      lines.push(lastYearLine);

      if (unpaidMonths.length > 0) {
        lines.push(I18n.t('debtMessageLastYearMonths').replace('{months}', unpaidMonths.join(', ')));
      }
    }

    // Link to resident page
    const params = getUrlParams();
    const residentUrl = `https://hayek.github.io/Manzel/resident.html?name=${encodeURIComponent(params.name)}&apt=${encodeURIComponent(params.apt || '')}`;
    lines.push('');
    lines.push(I18n.t('debtMessageLink'));
    lines.push(residentUrl);

    // Closing
    lines.push('');
    lines.push(I18n.t('debtMessageClosing'));

    return lines.join('\n');
  }

  /**
   * Copy debt message to clipboard
   */
  function copyDebtMessage() {
    const message = generateDebtMessage();
    if (!message) return;

    navigator.clipboard.writeText(message).then(() => {
      // Show feedback
      const copyBtn = document.getElementById('copyDebtBtn');
      copyBtn.classList.add('owed-card__action-btn--success');

      // Change icon to checkmark temporarily
      const originalIcon = copyBtn.innerHTML;
      copyBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';

      setTimeout(() => {
        copyBtn.classList.remove('owed-card__action-btn--success');
        copyBtn.innerHTML = originalIcon;
      }, 2000);
    }).catch(err => {
      console.error('Failed to copy:', err);
    });
  }

  /**
   * Format phone number for WhatsApp
   * @param {string} phone - Phone number
   * @returns {string} Formatted phone number (international format without +)
   */
  function formatPhoneForWhatsApp(phone) {
    // Remove all non-digit characters
    let digits = phone.replace(/\D/g, '');

    // If starts with 0, assume Israeli number and replace with 972
    if (digits.startsWith('0')) {
      digits = '972' + digits.substring(1);
    }

    return digits;
  }

  /**
   * Open WhatsApp with debt message
   */
  function openWhatsApp() {
    if (!residentData || !residentData.phone) return;

    const message = generateDebtMessage();
    const phone = formatPhoneForWhatsApp(residentData.phone);
    const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

    window.open(whatsappUrl, '_blank');
  }

  /**
   * Check if admin mode is enabled
   * @returns {boolean} True if admin mode is enabled
   */
  function isAdminMode() {
    return localStorage.getItem('manzel_admin') === 'true';
  }

  /**
   * Set up action buttons (copy and WhatsApp)
   */
  function setupActionButtons() {
    const actionsContainer = document.querySelector('.owed-card__actions');
    const copyBtn = document.getElementById('copyDebtBtn');
    const whatsappBtn = document.getElementById('whatsappBtn');

    // Hide all buttons if there's no debt
    if (residentData.owed <= 0 && residentData.lastYearOwed <= 0) {
      return;
    }

    // Show or hide based on admin mode
    if (actionsContainer) {
      actionsContainer.classList.remove('hidden');
      if (!isAdminMode()) {
        actionsContainer.style.display = 'none';
      }
    }

    // Set up copy button
    if (copyBtn) {
      copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        copyDebtMessage();
      });
    }

    // Set up WhatsApp button (hide if no phone number)
    if (whatsappBtn) {
      if (!residentData.phone) {
        whatsappBtn.style.display = 'none';
      } else {
        whatsappBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openWhatsApp();
        });
      }
    }
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

    // Hide all skeletons
    document.querySelectorAll('.skeleton, .skeleton-history').forEach(el => {
      el.classList.add('hidden');
    });

    // Hide owed card loading state
    const owedCard = document.getElementById('owedCard');
    if (owedCard) {
      owedCard.classList.remove('owed-card--loading');
      owedCard.classList.add('hidden');
    }
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
