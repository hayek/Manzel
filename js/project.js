/**
 * Project Detail Page Logic
 * Shows collection progress and per-apartment payments for one project
 */

const ProjectPage = (function() {
  const METHOD_KEYS = {
    cash: 'methodCash',
    bit: 'methodBit',
    paybox: 'methodPaybox'
  };

  /**
   * Initialize the page
   */
  async function init() {
    document.getElementById('backBtn').addEventListener('click', () => {
      window.location.href = 'index.html';
    });

    const id = new URLSearchParams(window.location.search).get('id');

    try {
      const data = await SheetsAPI.fetchAllData();
      const project = data.projects.find(p => p.id === id);

      if (!project) {
        showNotFound();
        return;
      }

      // Building order: top floor first
      const floorApts = data.building.flatMap(floor => floor.apartments);
      const summary = Projects.summarize(project, data.projectPayments, [...floorApts].sort((a, b) => a - b), data.projectExpenses);

      renderSummary(summary);
      renderApartments(summary, floorApts, data);
      renderExpenses(summary);
    } catch (error) {
      console.error('Failed to load project:', error);
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
   * Render the project summary card
   * @param {Object} summary - Result of Projects.summarize()
   */
  function renderSummary(summary) {
    const { project } = summary;
    document.title = `Manzel - ${project.name}`;

    document.getElementById('projectName').textContent = project.name;

    const due = document.getElementById('projectDue');
    if (project.dueDate) {
      due.textContent = I18n.t('projectDue').replace('{date}', project.dueDate);
    }
    if (Projects.isOverdue(summary, new Date())) {
      due.appendChild(el('span', 'badge badge--overdue', I18n.t('overdue')));
    }

    if (project.description) {
      const description = document.getElementById('projectDescription');
      description.textContent = project.description;
      description.classList.remove('hidden');
    }

    document.getElementById('projectCollected').textContent = I18n.t('projectCollected')
      .replace('{collected}', formatNumber(summary.collected))
      .replace('{goal}', formatNumber(summary.goal));

    const ratio = summary.goal ? summary.collected / summary.goal : 0;
    document.getElementById('projectProgressFill').style.width = `${Math.min(1, ratio) * 100}%`;

    document.getElementById('projectPaidOf').textContent = I18n.t('paidOf')
      .replace('{paid}', summary.paidCount)
      .replace('{total}', summary.aptCount);
    document.getElementById('projectPerApartment').textContent = I18n.t('perApartment')
      .replace('{amount}', formatNumber(project.perApartment));

    if (project.totalCost) {
      document.getElementById('projectTotalCost').textContent = I18n.t('totalCost')
        .replace('{amount}', formatNumber(project.totalCost));
    }

    if (summary.paidOut > 0) {
      const cost = project.totalCost || summary.goal;
      document.getElementById('projectPaidToContractor').textContent = I18n.t('projectPaidToContractor')
        .replace('{paid}', formatNumber(summary.paidOut))
        .replace('{total}', formatNumber(cost));
      document.getElementById('projectPayoutFill').style.width = `${Math.min(1, cost ? summary.paidOut / cost : 0) * 100}%`;
      document.getElementById('projectBalance').textContent = I18n.t('projectBalance')
        .replace('{amount}', formatNumber(summary.balance));
      document.getElementById('projectPayout').classList.remove('hidden');
    }

    document.getElementById('projectLoading').classList.add('hidden');
    document.getElementById('projectContent').classList.remove('hidden');
  }

  /**
   * Render the money paid out of the project (newest first)
   * @param {Object} summary - Result of Projects.summarize()
   */
  function renderExpenses(summary) {
    if (summary.expenses.length === 0) return;

    const list = document.getElementById('projectExpensesList');
    list.innerHTML = '';
    [...summary.expenses].reverse().forEach(expense => {
      const item = el('li', 'expense-item');
      item.appendChild(el('span', 'expense-item__icon', '🏗️'));

      const body = el('span', 'expense-item__body');
      const description = el('span', 'expense-item__type', expense.description || '-');
      description.setAttribute('dir', 'auto');
      body.appendChild(description);
      const details = el('span', 'expense-item__notes', expense.date);
      if (expense.receipt) {
        const link = el('a', 'project-expense__receipt', I18n.t('viewReceipt'));
        link.href = expense.receipt;
        link.target = '_blank';
        link.rel = 'noopener';
        details.appendChild(document.createTextNode(expense.date ? ' · ' : ''));
        details.appendChild(link);
      }
      body.appendChild(details);
      item.appendChild(body);

      const amount = el('span', 'expense-item__amount', `${formatNumber(-expense.amount)} ₪`);
      amount.setAttribute('dir', 'ltr');
      item.appendChild(amount);
      list.appendChild(item);
    });

    document.getElementById('projectExpensesSection').classList.remove('hidden');
  }

  /**
   * Render the list of apartments with their payment status
   * @param {Object} summary - Result of Projects.summarize()
   * @param {Array<number>} floorApts - Apartment numbers in building order
   * @param {Object} data - All sheet data
   */
  function renderApartments(summary, floorApts, data) {
    const list = document.getElementById('projectApartments');
    list.innerHTML = '';

    floorApts.forEach(apt => {
      const status = summary.apartments[apt];
      const item = el('li', 'project-apartment');

      const header = el('div', 'project-apartment__header');
      const name = el('span', 'project-apartment__name', getDisplayName(data, apt));
      name.setAttribute('dir', 'auto');
      header.appendChild(name);

      const right = el('span', 'project-apartment__right');
      right.appendChild(createStatusBadge(status));
      right.appendChild(el('span', 'apartment__number', `${I18n.t('apartment')} ${apt}`));
      header.appendChild(right);
      item.appendChild(header);

      if (status.payments.length > 0) {
        const payments = el('ul', 'project-apartment__payments');
        status.payments.forEach(payment => {
          const parts = [payment.date, `${formatNumber(payment.amount)} ₪`, I18n.t(METHOD_KEYS[payment.method])];
          payments.appendChild(el('li', '', parts.filter(Boolean).join(' · ')));
        });
        item.appendChild(payments);
      }

      list.appendChild(item);
    });

    document.getElementById('apartmentsSection').classList.remove('hidden');
  }

  /**
   * Create the paid / partial / unpaid badge
   * @param {Object} status - Apartment entry from summary.apartments
   * @returns {HTMLElement} Badge element
   */
  function createStatusBadge(status) {
    if (status.status === 'paid') {
      return el('span', 'badge badge--paid', I18n.t('paid'));
    }
    if (status.status === 'partial') {
      return el('span', 'badge badge--partial', I18n.t('remaining').replace('{amount}', formatNumber(status.remaining)));
    }
    return el('span', 'badge badge--unpaid', I18n.t('notPaid'));
  }

  /**
   * Get an apartment's display name (same rule as the main page)
   * @param {Object} data - All sheet data
   * @param {number} apt - Apartment number
   * @returns {string} Display name
   */
  function getDisplayName(data, apt) {
    const info = data.residents[String(apt)] || {};
    return info.displayName || data.payments.residents[apt - 1] || `${I18n.t('apartment')} ${apt}`;
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
   * Show the not-found state
   */
  function showNotFound() {
    document.getElementById('projectHero').classList.add('hidden');
    document.getElementById('notFound').classList.remove('hidden');
  }

  /**
   * Show error message
   */
  function showError() {
    const container = document.querySelector('.container');
    const errorDiv = el('div', 'error', I18n.t('error'));
    container.insertBefore(errorDiv, container.children[1]);
    document.querySelectorAll('.skeleton-group').forEach(node => node.classList.add('hidden'));
  }

  // Initialize on DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    // Small delay to ensure i18n is initialized
    setTimeout(init, 100);
  });

  return {
    init
  };
})();
