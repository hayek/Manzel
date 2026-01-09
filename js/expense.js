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
    const receiptContainer = document.getElementById('receiptContainer');
    const receiptPreview = document.getElementById('receiptPreview');
    if (expense.receipt && expense.receipt !== 'null' && expense.receipt !== '') {
      if (expense.receipt.startsWith('http')) {
        // Convert Google Drive URL to embeddable format
        const imgUrl = convertToDirectImageUrl(expense.receipt);

        // Create inline preview
        const img = document.createElement('img');
        img.src = imgUrl;
        img.alt = I18n.t('expenseReceipt') || 'קבלה';
        img.className = 'expense-detail__receipt-img';
        img.addEventListener('click', () => {
          window.open(expense.receipt, '_blank');
        });
        // Fallback to link if image fails to load
        img.addEventListener('error', () => {
          receiptPreview.innerHTML = '';
          const link = document.createElement('a');
          link.href = expense.receipt;
          link.target = '_blank';
          link.textContent = I18n.t('viewReceipt') || 'צפה בקבלה';
          link.className = 'expense-detail__link';
          receiptPreview.appendChild(link);
        });
        receiptPreview.appendChild(img);
      } else {
        // Plain text receipt
        receiptPreview.textContent = expense.receipt;
      }
    } else {
      receiptContainer.style.display = 'none';
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
   * Convert Google Drive sharing URL to direct image URL
   * @param {string} url - Original URL
   * @returns {string} Direct image URL
   */
  function convertToDirectImageUrl(url) {
    // Google Drive file URL: https://drive.google.com/file/d/FILE_ID/view...
    const driveFileMatch = url.match(/drive\.google\.com\/file\/d\/([^\/]+)/);
    if (driveFileMatch) {
      return `https://drive.google.com/thumbnail?id=${driveFileMatch[1]}&sz=w1000`;
    }

    // Google Drive open URL: https://drive.google.com/open?id=FILE_ID
    const driveOpenMatch = url.match(/drive\.google\.com\/open\?id=([^&]+)/);
    if (driveOpenMatch) {
      return `https://drive.google.com/thumbnail?id=${driveOpenMatch[1]}&sz=w1000`;
    }

    // Already a direct URL or other format
    return url;
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
