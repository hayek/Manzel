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
      renderAnnouncement(appData.announcement);
      renderTotal(appData.total);
      renderMonthProgress(appData.building, appData.payments);
      renderProjects(appData.projects, appData.projectPayments, appData.building);
      renderBuilding(appData.building, appData.payments, appData.residents);
      renderExpenses(appData.expenses);

    } catch (error) {
      console.error('Failed to initialize app:', error);
      showError();
    }
  }

  /**
   * Create a DOM element with optional class and text
   * @param {string} tag - Tag name
   * @param {string} [className] - CSS class(es)
   * @param {string} [text] - Text content
   * @returns {HTMLElement} Element
   */
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  /**
   * Get all apartment numbers in the building, ascending
   * @param {Array} floors - Building floors data
   * @returns {Array<number>} Apartment numbers
   */
  function getAptNumbers(floors) {
    return floors.flatMap(floor => floor.apartments).sort((a, b) => a - b);
  }

  /**
   * Render the announcement strip (hidden when empty)
   * @param {string} text - Announcement text
   */
  function renderAnnouncement(text) {
    if (!text) return;
    document.getElementById('announcementText').textContent = text;
    document.getElementById('announcement').classList.remove('hidden');
  }

  /**
   * Render how many apartments paid for the current month
   * @param {Array} floors - Building floors data
   * @param {Object} paymentsData - Payments data
   */
  function renderMonthProgress(floors, paymentsData) {
    const now = new Date();
    const apts = getAptNumbers(floors);
    if (apts.length === 0) return;

    // 0 means discount (paid yearly), so it counts as paid
    const count = apts.filter(apt => {
      const name = paymentsData.residents[apt - 1];
      const payment = ((paymentsData.payments[name] || {})[now.getFullYear()] || [])[now.getMonth()];
      return payment && payment.amount !== null && !Number.isNaN(payment.amount);
    }).length;

    document.getElementById('monthProgressLabel').textContent = I18n.t('paidThisMonth')
      .replace('{count}', count)
      .replace('{total}', apts.length);
    document.getElementById('monthProgressFill').style.width = `${(count / apts.length) * 100}%`;
    document.getElementById('monthProgress').classList.remove('hidden');
  }

  /**
   * Render the projects section
   * @param {Array} projects - Projects from the Projects sheet
   * @param {Array} payments - Payments from the ProjectPayments sheet
   * @param {Array} floors - Building floors data
   */
  function renderProjects(projects, payments, floors) {
    if (!projects || projects.length === 0) return;

    const apts = getAptNumbers(floors);
    const list = document.getElementById('projectsList');
    list.innerHTML = '';

    projects
      .filter(project => project.status === 'open')
      .forEach(project => list.appendChild(createProjectCard(Projects.summarize(project, payments, apts))));

    const done = projects.filter(project => project.status === 'done');
    if (done.length > 0) {
      const doneList = document.getElementById('completedProjectsList');
      doneList.innerHTML = '';
      done.forEach(project => {
        const link = el('a', 'completed-projects__item', project.name);
        link.setAttribute('dir', 'auto');
        link.href = projectUrl(project.id);
        doneList.appendChild(link);
      });
      document.getElementById('completedProjects').classList.remove('hidden');
    }

    document.getElementById('projectsSection').classList.remove('hidden');
  }

  /**
   * Build the link to a project page
   * @param {string} id - Project id
   * @returns {string} URL
   */
  function projectUrl(id) {
    return `project.html?${new URLSearchParams({ id }).toString()}`;
  }

  /**
   * Create a project card
   * @param {Object} summary - Result of Projects.summarize()
   * @returns {HTMLElement} Card element (a link to the project page)
   */
  function createProjectCard(summary) {
    const { project } = summary;
    const card = el('a', 'project-card');
    card.href = projectUrl(project.id);

    const header = el('div', 'project-card__header');
    const name = el('span', 'project-card__name', project.name);
    name.setAttribute('dir', 'auto');
    header.appendChild(name);
    const due = el('span', 'project-card__due');
    if (project.dueDate) {
      due.textContent = I18n.t('projectDue').replace('{date}', project.dueDate);
    }
    if (Projects.isOverdue(summary, new Date())) {
      due.appendChild(el('span', 'badge badge--overdue', I18n.t('overdue')));
    }
    header.appendChild(due);
    card.appendChild(header);

    card.appendChild(createProgressBar(summary.goal ? summary.collected / summary.goal : 0));

    const meta = el('div', 'project-card__meta');
    meta.appendChild(el('span', '', I18n.t('projectCollected')
      .replace('{collected}', formatNumber(summary.collected))
      .replace('{goal}', formatNumber(summary.goal))));
    meta.appendChild(el('span', '', I18n.t('projectApartments')
      .replace('{paid}', summary.paidCount)
      .replace('{total}', summary.aptCount)));
    card.appendChild(meta);

    const dots = el('div', 'apt-dots');
    Object.keys(summary.apartments).forEach(apt => {
      const dot = el('span', `apt-dot apt-dot--${summary.apartments[apt].status}`, apt);
      dot.title = `${I18n.t('apartment')} ${apt}`;
      dots.appendChild(dot);
    });
    card.appendChild(dots);

    return card;
  }

  /**
   * Create a progress bar
   * @param {number} ratio - Filled fraction (0-1)
   * @returns {HTMLElement} Progress bar element
   */
  function createProgressBar(ratio) {
    const bar = el('div', 'progress');
    const fill = el('div', 'progress__fill progress__fill--success');
    fill.style.width = `${Math.min(1, Math.max(0, ratio)) * 100}%`;
    bar.appendChild(fill);
    return bar;
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
   * @param {Object} residentsData - Residents info map
   */
  function renderBuilding(floors, paymentsData, residentsData) {
    const loading = document.getElementById('buildingLoading');
    const grid = document.getElementById('buildingGrid');

    loading.classList.add('hidden');
    grid.classList.remove('hidden');
    document.getElementById('buildingLegend').classList.remove('hidden');
    document.getElementById('buildingYear').textContent = `· ${new Date().getFullYear()}`;

    // Clear existing content
    grid.innerHTML = '';

    const residents = paymentsData.residents || [];

    // Render each floor (floors are already in top-to-bottom order)
    floors.forEach((floor) => {
      const floorEl = createFloorElement(floor, residents, paymentsData, residentsData);
      grid.appendChild(floorEl);
    });
  }

  /**
   * Create floor DOM element
   * @param {Object} floor - Floor data { number, apartments: [aptNumbers] }
   * @param {Array} residents - Residents names array (index 0 = apt 1)
   * @param {Object} paymentsData - Payments data
   * @param {Object} residentsData - Residents info map
   * @returns {HTMLElement} Floor element
   */
  function createFloorElement(floor, residents, paymentsData, residentsData) {
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
      const paymentKey = residents[aptNumber - 1] || '';
      // Get display name from residents data (keyed by apartment number)
      const residentInfo = residentsData[String(aptNumber)] || {};
      const displayName = residentInfo.displayName || paymentKey || `${I18n.t('apartment')} ${aptNumber}`;
      const apt = {
        name: paymentKey, // Keep original name for payment lookup
        displayName: displayName,
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
    name.textContent = apt.displayName || apt.name;

    // Calculate debt
    const residentPayments = paymentsData.payments[apt.name] || {};
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const yearPayments = residentPayments[currentYear] || [];
    const monthlyAmount = 50;
    let owed = 0;

    // Debt is counted from the next month (e.g., Jan unpaid counts as debt starting Feb)
    for (let i = 0; i < currentMonth; i++) {
      const payment = yearPayments[i];
      // 0 means discount (paid yearly), so don't count as debt
      if (!payment || payment.amount === null) {
        owed += monthlyAmount;
      } else if (payment.amount > 0 && payment.amount < monthlyAmount) {
        owed += monthlyAmount - payment.amount;
      }
    }

    // Right side with debt and apt number
    const rightSide = document.createElement('div');
    rightSide.className = 'apartment__right';

    // Show debt if any (left of apt number)
    if (owed > 0) {
      const debtEl = document.createElement('div');
      debtEl.className = 'apartment__debt';
      debtEl.textContent = `${I18n.t('debt')}: ${formatNumber(owed)} ₪`;
      rightSide.appendChild(debtEl);
    }

    const number = document.createElement('span');
    number.className = 'apartment__number';
    number.textContent = `${I18n.t('apartment')} ${apt.number}`;
    rightSide.appendChild(number);

    header.appendChild(name);
    header.appendChild(rightSide);
    aptEl.appendChild(header);

    // Payment boxes (12 months for current year)
    const boxesContainer = document.createElement('div');
    boxesContainer.className = 'payment-boxes';

    for (let i = 0; i < 12; i++) {
      const box = document.createElement('div');
      box.className = 'payment-box';

      const payment = yearPayments[i];
      const isFuture = i > currentMonth;

      // Show green if paid, even for future months
      // 0 means discount (paid yearly)
      if (payment && payment.amount > 0) {
        box.classList.add('payment-box--paid');
      } else if (payment && payment.amount === 0) {
        box.classList.add('payment-box--discount');
      } else if (isFuture) {
        box.classList.add('payment-box--future');
      } else {
        box.classList.add('payment-box--unpaid');
      }

      if (i === currentMonth) {
        box.classList.add('payment-box--current');
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
      const list = document.getElementById('expensesBody');
      list.innerHTML = '';
      list.appendChild(el('li', 'expense-list__empty', I18n.t('noExpenses')));
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
    const list = document.getElementById('expensesBody');
    list.innerHTML = '';

    const start = (page - 1) * EXPENSES_PER_PAGE;
    const end = start + EXPENSES_PER_PAGE;
    const pageExpenses = expenses.slice(start, end);

    pageExpenses.forEach(expense => {
      const item = el('li', 'expense-item');
      item.setAttribute('role', 'button');
      item.setAttribute('tabindex', '0');

      item.appendChild(el('span', 'expense-item__icon', getExpenseIcon(expense.type)));

      const body = el('span', 'expense-item__body');
      body.appendChild(el('span', 'expense-item__type', I18n.translateExpenseType(expense.type)));
      if (expense.notes) {
        body.appendChild(el('span', 'expense-item__notes', String(expense.notes).trim()));
      }
      item.appendChild(body);

      const amountClass = expense.price > 0 ? 'expense-item__amount expense-item__amount--income' : 'expense-item__amount';
      const amount = el('span', amountClass, formatNumber(expense.price) + ' ₪');
      amount.setAttribute('dir', 'ltr');
      item.appendChild(amount);

      // Click handler to navigate to expense detail
      item.addEventListener('click', () => {
        navigateToExpense(expense);
      });

      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          navigateToExpense(expense);
        }
      });

      list.appendChild(item);
    });
  }

  /**
   * Pick an icon for an expense type
   * @param {string} type - Hebrew expense type
   * @returns {string} Emoji icon
   */
  function getExpenseIcon(type) {
    const text = String(type || '');
    if (text.includes('מנקה') || text.includes('ניקוי')) return '🧹';
    if (text.includes('חשמל')) return '⚡';
    return '🧾';
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
    document.querySelectorAll('.loading, .skeleton-group').forEach(node => node.classList.add('hidden'));
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
