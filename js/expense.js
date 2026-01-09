/**
 * Expense Detail Page Logic
 * Shows details for a specific expense
 */

const ExpensePage = (function() {
  /**
   * Get URL parameters
   * @returns {Object} URL parameters
   */
  function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    return {
      type: params.get('type'),
      price: params.get('price'),
      receipt: params.get('receipt'),
      notes: params.get('notes')
    };
  }

  /**
   * Initialize the page
   */
  function init() {
    const params = getUrlParams();

    if (!params.type) {
      window.location.href = 'index.html';
      return;
    }

    // Set up back button
    document.getElementById('backBtn').addEventListener('click', () => {
      window.location.href = 'index.html';
    });

    // Render expense details
    renderExpenseDetails(params);
  }

  /**
   * Render expense details
   * @param {Object} expense - Expense data
   */
  function renderExpenseDetails(expense) {
    // Type
    document.getElementById('expenseType').textContent = expense.type;

    // Price
    const price = parseFloat(expense.price) || 0;
    document.getElementById('expensePrice').textContent = formatNumber(price) + ' ₪';

    // Receipt
    const receiptRow = document.getElementById('receiptRow');
    const receiptEl = document.getElementById('expenseReceipt');
    if (expense.receipt && expense.receipt !== 'null' && expense.receipt !== '') {
      if (expense.receipt.startsWith('http')) {
        const link = document.createElement('a');
        link.href = expense.receipt;
        link.target = '_blank';
        link.textContent = I18n.t('viewReceipt') || 'צפה בקבלה';
        link.className = 'expense-detail__link';
        receiptEl.innerHTML = '';
        receiptEl.appendChild(link);
      } else {
        receiptEl.textContent = expense.receipt;
      }
    } else {
      receiptRow.style.display = 'none';
    }

    // Notes
    const notesRow = document.getElementById('notesRow');
    const notesEl = document.getElementById('expenseNotes');
    if (expense.notes && expense.notes !== 'null' && expense.notes !== '') {
      notesEl.textContent = expense.notes;
    } else {
      notesRow.style.display = 'none';
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

  // Initialize on DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(init, 100);
  });

  return {
    init
  };
})();
