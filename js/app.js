/**
 * Main Application Logic
 * Handles the main page with building view and expenses
 */

const App = (function() {
  let appData = null;
  let expensesPage = 1;
  const EXPENSES_PER_PAGE = 10;

  /**
   * Initialize the application
   */
  async function init() {
    try {
      // Fetch all data
      appData = await SheetsAPI.fetchAllData();

      // Render all sections
      renderTotal(appData.total);
      renderBuilding(appData.building, appData.payments);
      renderExpenses(appData.expenses);

    } catch (error) {
      console.error('Failed to initialize app:', error);
      showError();
    }
  }

  /**
   * Render total fund amount
   * @param {number} total - Total amount
   */
  function renderTotal(total) {
    const loading = document.getElementById('totalLoading');
    const amountEl = document.getElementById('totalAmount');
    const valueEl = document.getElementById('totalValue');

    loading.classList.add('hidden');
    amountEl.classList.remove('hidden');
    valueEl.textContent = formatNumber(total);
  }

  /**
   * Render building layout with payment status
   * @param {Array} floors - Building floors data (apartment numbers per floor)
   * @param {Object} paymentsData - Payments data
   */
  function renderBuilding(floors, paymentsData) {
    const loading = document.getElementById('buildingLoading');
    const grid = document.getElementById('buildingGrid');

    loading.classList.add('hidden');
    grid.classList.remove('hidden');

    // Clear existing content
    grid.innerHTML = '';

    const residents = paymentsData.residents || [];

    // Render each floor (floors are already in top-to-bottom order)
    floors.forEach((floor) => {
      const floorEl = createFloorElement(floor, residents, paymentsData);
      grid.appendChild(floorEl);
    });
  }

  /**
   * Create floor DOM element
   * @param {Object} floor - Floor data { number, apartments: [aptNumbers] }
   * @param {Array} residents - Residents names array (index 0 = apt 1)
   * @param {Object} paymentsData - Payments data
   * @returns {HTMLElement} Floor element
   */
  function createFloorElement(floor, residents, paymentsData) {
    const floorEl = document.createElement('div');
    floorEl.className = 'floor';

    // Floor label
    const label = document.createElement('div');
    label.className = 'floor__label';
    label.textContent = `${I18n.t('floor')} ${floor.number}`;
    floorEl.appendChild(label);

    // Apartments container
    const aptsContainer = document.createElement('div');
    aptsContainer.className = 'floor__apartments';

    if (floor.apartments.length === 1) {
      aptsContainer.classList.add('floor__apartments--single');
    }

    // Create apartment cards - apartments is array of apartment numbers
    floor.apartments.forEach(aptNumber => {
      // Map apartment number to resident name (apt 1 = residents[0], etc.)
      const residentName = residents[aptNumber - 1] || `${I18n.t('apartment')} ${aptNumber}`;
      const apt = {
        name: residentName,
        number: aptNumber
      };
      const aptEl = createApartmentElement(apt, paymentsData);
      aptsContainer.appendChild(aptEl);
    });

    floorEl.appendChild(aptsContainer);
    return floorEl;
  }

  /**
   * Create apartment card DOM element
   * @param {Object} apt - Apartment data
   * @param {Object} paymentsData - Payments data
   * @returns {HTMLElement} Apartment element
   */
  function createApartmentElement(apt, paymentsData) {
    const aptEl = document.createElement('div');
    aptEl.className = 'apartment';
    aptEl.setAttribute('role', 'button');
    aptEl.setAttribute('tabindex', '0');

    // Header with name and number
    const header = document.createElement('div');
    header.className = 'apartment__header';

    const name = document.createElement('span');
    name.className = 'apartment__name';
    name.textContent = apt.name;

    const number = document.createElement('span');
    number.className = 'apartment__number';
    number.textContent = `${I18n.t('apartment')} ${apt.number}`;

    header.appendChild(name);
    header.appendChild(number);
    aptEl.appendChild(header);

    // Payment boxes (12 months for current year)
    const residentPayments = paymentsData.payments[apt.name] || {};
    const boxesContainer = document.createElement('div');
    boxesContainer.className = 'payment-boxes';

    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const yearPayments = residentPayments[currentYear] || [];

    console.log(`Resident: ${apt.name}, Year: ${currentYear}, Payments:`, yearPayments);

    for (let i = 0; i < 12; i++) {
      const box = document.createElement('div');
      box.className = 'payment-box';

      const payment = yearPayments[i];
      const isFuture = i > currentMonth;

      // Show green if paid, even for future months
      if (payment && payment.amount > 0) {
        box.classList.add('payment-box--paid');
      } else if (payment && payment.amount === 0) {
        box.classList.add('payment-box--zero');
      } else if (isFuture) {
        box.classList.add('payment-box--future');
      } else {
        box.classList.add('payment-box--unpaid');
      }

      box.setAttribute('data-month', I18n.getMonthName(i));
      boxesContainer.appendChild(box);
    }

    aptEl.appendChild(boxesContainer);

    // Click handler to navigate to resident detail
    aptEl.addEventListener('click', () => {
      navigateToResident(apt.name, apt.number);
    });

    aptEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        navigateToResident(apt.name, apt.number);
      }
    });

    return aptEl;
  }

  /**
   * Navigate to resident detail page
   * @param {string} name - Resident name
   * @param {number} aptNumber - Apartment number
   */
  function navigateToResident(name, aptNumber) {
    const params = new URLSearchParams({
      name: name,
      apt: aptNumber
    });
    window.location.href = `resident.html?${params.toString()}`;
  }

  /**
   * Navigate to expense detail page
   * @param {Object} expense - Expense data
   */
  function navigateToExpense(expense) {
    const params = new URLSearchParams({
      type: expense.type || '',
      price: expense.price || 0,
      receipt: expense.receipt || '',
      notes: expense.notes || ''
    });
    window.location.href = `expense.html?${params.toString()}`;
  }

  /**
   * Render expenses table with pagination
   * @param {Array} expenses - Expenses data
   */
  function renderExpenses(expenses) {
    const loading = document.getElementById('expensesLoading');
    const table = document.getElementById('expensesTable');

    loading.classList.add('hidden');
    table.classList.remove('hidden');

    if (expenses.length === 0) {
      const tbody = document.getElementById('expensesBody');
      tbody.innerHTML = '';
      const row = document.createElement('tr');
      row.innerHTML = `<td colspan="3" class="text-center">${I18n.t('loading')}</td>`;
      tbody.appendChild(row);
      return;
    }

    renderExpensesPage(expenses, expensesPage);
    renderPagination(expenses);
  }

  /**
   * Render a specific page of expenses
   * @param {Array} expenses - All expenses
   * @param {number} page - Page number (1-based)
   */
  function renderExpensesPage(expenses, page) {
    const tbody = document.getElementById('expensesBody');
    tbody.innerHTML = '';

    const start = (page - 1) * EXPENSES_PER_PAGE;
    const end = start + EXPENSES_PER_PAGE;
    const pageExpenses = expenses.slice(start, end);

    pageExpenses.forEach(expense => {
      const row = document.createElement('tr');

      const typeCell = document.createElement('td');
      typeCell.textContent = expense.type;

      const priceCell = document.createElement('td');
      priceCell.textContent = formatNumber(expense.price) + ' ₪';

      const receiptCell = document.createElement('td');
      if (expense.receipt && expense.receipt.startsWith('http')) {
        receiptCell.textContent = '📄';
      } else {
        receiptCell.textContent = expense.receipt || '-';
      }

      row.appendChild(typeCell);
      row.appendChild(priceCell);
      row.appendChild(receiptCell);

      // Click handler to navigate to expense detail
      row.addEventListener('click', () => {
        navigateToExpense(expense);
      });

      tbody.appendChild(row);
    });
  }

  /**
   * Render pagination controls
   * @param {Array} expenses - All expenses
   */
  function renderPagination(expenses) {
    const pagination = document.getElementById('expensesPagination');
    pagination.innerHTML = '';

    const totalPages = Math.ceil(expenses.length / EXPENSES_PER_PAGE);
    if (totalPages <= 1) return;

    // Previous button
    const prevBtn = document.createElement('button');
    prevBtn.className = 'pagination__btn';
    prevBtn.textContent = '←';
    prevBtn.disabled = expensesPage === 1;
    prevBtn.addEventListener('click', () => {
      if (expensesPage > 1) {
        expensesPage--;
        renderExpensesPage(expenses, expensesPage);
        renderPagination(expenses);
      }
    });
    pagination.appendChild(prevBtn);

    // Page info
    const info = document.createElement('span');
    info.className = 'pagination__info';
    info.textContent = `${expensesPage} / ${totalPages}`;
    pagination.appendChild(info);

    // Next button
    const nextBtn = document.createElement('button');
    nextBtn.className = 'pagination__btn';
    nextBtn.textContent = '→';
    nextBtn.disabled = expensesPage === totalPages;
    nextBtn.addEventListener('click', () => {
      if (expensesPage < totalPages) {
        expensesPage++;
        renderExpensesPage(expenses, expensesPage);
        renderPagination(expenses);
      }
    });
    pagination.appendChild(nextBtn);
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
    container.insertBefore(errorDiv, container.firstChild);

    // Hide loading spinners
    document.querySelectorAll('.loading').forEach(el => el.classList.add('hidden'));
  }

  // Initialize on DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    // Small delay to ensure i18n is initialized
    setTimeout(init, 100);
  });

  // Public API
  return {
    init,
    getData: () => appData
  };
})();
