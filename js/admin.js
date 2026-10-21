/**
 * Admin Page Logic
 * PIN screen, then forms for monthly payments, project payments and expenses
 */

const AdminPage = (function() {
  const MONTHLY_AMOUNT = 50;
  const RECEIPT_MAX_SIDE = 2000;
  const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;
  const LOCALES = { he: 'he-IL', en: 'en-GB', ar: 'ar', ru: 'ru-RU', uk: 'uk-UA' };

  let data = null;
  let monthlyApt = null;
  let projectApt = null;
  let selectedMonths = new Set();
  let wholeYear = false;
  // Last unsaved request: retrying the same save reuses its id so the script won't write twice
  let pendingRequest = null;
  // Receipt picked for the expense form: { name, mimeType, data (base64) }
  let receiptFile = null;

  /**
   * Initialize the page
   */
  function init() {
    document.getElementById('backBtn').addEventListener('click', () => {
      window.location.href = '../index.html';
    });

    document.getElementById('pinForm').addEventListener('submit', onLogin);
    document.getElementById('logoutBtn').addEventListener('click', () => {
      AdminAPI.logout();
      showPinScreen();
    });

    document.querySelectorAll('.segmented__btn').forEach(btn => {
      btn.addEventListener('click', () => showPanel(btn.dataset.panel));
    });

    document.getElementById('monthlyYear').addEventListener('change', () => {
      selectedMonths.clear();
      wholeYear = false;
      renderMonths();
    });
    document.getElementById('wholeYearBtn').addEventListener('click', selectWholeYear);
    document.getElementById('projectSelect').addEventListener('change', () => {
      projectApt = null;
      renderProjectApartments();
    });

    document.getElementById('monthlyForm').addEventListener('submit', onSaveMonthly);
    document.getElementById('projectForm').addEventListener('submit', onSaveProject);
    document.getElementById('expenseForm').addEventListener('submit', onSaveExpense);
    document.getElementById('expenseReceipt').addEventListener('change', onPickReceipt);
    document.getElementById('receiptRemove').addEventListener('click', clearReceipt);

    if (AdminAPI.isLoggedIn()) {
      showPanelScreen();
    } else {
      showPinScreen();
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
   * Show the PIN screen
   */
  function showPinScreen() {
    document.getElementById('adminPanel').classList.add('hidden');
    document.getElementById('pinScreen').classList.remove('hidden');
    document.getElementById('pinInput').value = '';
    document.getElementById('pinInput').focus();
  }

  /**
   * Show the admin panel and load the sheet data
   */
  async function showPanelScreen() {
    document.getElementById('pinScreen').classList.add('hidden');
    document.getElementById('adminPanel').classList.remove('hidden');
    await reloadData(false);
  }

  /**
   * Handle the PIN form
   * @param {Event} e - Submit event
   */
  async function onLogin(e) {
    e.preventDefault();
    const input = document.getElementById('pinInput');
    const submit = document.getElementById('pinSubmit');
    const errorEl = document.getElementById('pinError');

    submit.disabled = true;
    errorEl.classList.add('hidden');
    const result = await AdminAPI.login(input.value.trim());
    submit.disabled = false;

    if (result.ok) {
      showPanelScreen();
      return;
    }
    errorEl.textContent = describeError(result);
    errorEl.classList.remove('hidden');
    input.value = '';
    input.focus();
  }

  /**
   * Turn a failed web app response into a message
   * @param {Object} result - Web app response
   * @returns {string} Message for the admin
   */
  function describeError(result) {
    if (result.error === 'bad_pin') return I18n.t('adminWrongPin');
    if (result.error === 'locked') {
      const time = new Date(result.retryAt).toLocaleString(LOCALES[I18n.getCurrentLanguage()] || 'he-IL', {
        day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit'
      });
      return I18n.t('adminLocked').replace('{time}', time);
    }
    if (result.error === 'missing_year') return I18n.t('adminMissingYear').replace('{year}', result.year);
    if (result.error === 'network') return I18n.t('adminNetworkRetry');
    return result.message || I18n.t('error');
  }

  /**
   * Switch between the Monthly / Project / Expense forms
   * @param {string} panel - Panel name
   */
  function showPanel(panel) {
    document.querySelectorAll('.segmented__btn').forEach(btn => {
      const active = btn.dataset.panel === panel;
      btn.classList.toggle('segmented__btn--active', active);
      btn.setAttribute('aria-selected', active);
    });
    document.querySelectorAll('.admin-form').forEach(form => {
      form.classList.toggle('hidden', form.dataset.panel !== panel);
    });
    hideMessage();
  }

  /**
   * Fetch the sheet data and re-render the forms
   * @param {boolean} force - Skip the cache
   */
  async function reloadData(force) {
    try {
      data = await SheetsAPI.fetchAllData(force);
      renderAll();
    } catch (error) {
      console.error('Failed to load data:', error);
      showMessage(I18n.t('error'), true);
    }
  }

  /**
   * Render every form from the current data
   */
  function renderAll() {
    renderYears();
    renderMonthlyApartments();
    renderMonths();
    renderProjects();
    renderExpenseTypes();
    renderExpenseFrom();

    const today = todayIso();
    document.getElementById('projectDate').value = today;
    document.getElementById('expenseDate').value = today;
  }

  /**
   * Today's date as yyyy-mm-dd (local time)
   * @returns {string} Date string
   */
  function todayIso() {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  }

  /**
   * All apartment numbers, ascending
   * @returns {Array<number>} Apartment numbers
   */
  function getAptNumbers() {
    return data.building.flatMap(floor => floor.apartments).sort((a, b) => a - b);
  }

  /**
   * Apartment display name (same rule as the main page)
   * @param {number} apt - Apartment number
   * @returns {string} Display name
   */
  function getDisplayName(apt) {
    const info = data.residents[String(apt)] || {};
    return info.displayName || data.payments.residents[apt - 1] || `${I18n.t('apartment')} ${apt}`;
  }

  /**
   * Render an apartment picker
   * @param {string} containerId - Container element id
   * @param {Function} isSelected - apt => boolean
   * @param {Function} onPick - apt => void
   * @param {Function} [subtitle] - apt => string shown under the name
   */
  function renderAptPicker(containerId, isSelected, onPick, subtitle) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    getAptNumbers().forEach(apt => {
      const btn = el('button', `apt-pick${isSelected(apt) ? ' apt-pick--selected' : ''}`);
      btn.type = 'button';
      btn.setAttribute('aria-pressed', isSelected(apt));
      btn.appendChild(el('span', 'apt-pick__number', String(apt)));
      const name = el('span', 'apt-pick__name', getDisplayName(apt));
      name.setAttribute('dir', 'auto');
      btn.appendChild(name);
      if (subtitle) btn.appendChild(el('span', 'apt-pick__sub', subtitle(apt)));
      btn.addEventListener('click', () => onPick(apt));
      container.appendChild(btn);
    });
  }

  /**
   * Render the monthly apartment picker
   */
  function renderMonthlyApartments() {
    renderAptPicker('monthlyApts', apt => monthlyApt === apt, apt => {
      monthlyApt = apt;
      selectedMonths.clear();
      wholeYear = false;
      renderMonthlyApartments();
      renderMonths();
    });
  }

  /**
   * Fill the year select with years that have rows in the sheet
   */
  function renderYears() {
    const select = document.getElementById('monthlyYear');
    const previous = Number(select.value);
    const years = data.payments.years.length > 0 ? data.payments.years : [new Date().getFullYear()];
    select.innerHTML = '';
    years.forEach(year => {
      const option = el('option', '', String(year));
      option.value = year;
      select.appendChild(option);
    });
    const current = new Date().getFullYear();
    select.value = years.includes(previous) ? previous : (years.includes(current) ? current : years[0]);
  }

  /**
   * Payment entry for an apartment's month in the selected year
   * @param {number} apt - Apartment number
   * @param {number} month - 0-11
   * @returns {Object|null} { amount } or null
   */
  function getMonthPayment(apt, month) {
    const name = data.payments.residents[apt - 1];
    const year = Number(document.getElementById('monthlyYear').value);
    return ((data.payments.payments[name] || {})[year] || [])[month] || null;
  }

  /**
   * Render the month chips; months already recorded are disabled
   */
  function renderMonths() {
    const container = document.getElementById('monthlyMonths');
    container.innerHTML = '';
    // The yearly discount only applies to a year with nothing recorded yet
    document.getElementById('wholeYearBtn').disabled = !monthlyApt || !isYearEmpty(monthlyApt);
    for (let month = 0; month < 12; month++) {
      const payment = monthlyApt ? getMonthPayment(monthlyApt, month) : null;
      const recorded = Boolean(payment && payment.amount !== null);
      const chip = el('button', 'month-chip', I18n.getMonthName(month));
      chip.type = 'button';
      chip.disabled = !monthlyApt || recorded;
      if (recorded) chip.classList.add('month-chip--recorded');
      if (selectedMonths.has(month)) chip.classList.add('month-chip--selected');
      chip.setAttribute('aria-pressed', selectedMonths.has(month));
      chip.addEventListener('click', () => {
        wholeYear = false;
        if (selectedMonths.has(month)) selectedMonths.delete(month);
        else selectedMonths.add(month);
        renderMonths();
      });
      container.appendChild(chip);
    }
  }

  /**
   * Does the apartment have nothing recorded for the selected year?
   * @param {number} apt - Apartment number
   * @returns {boolean} True if all 12 months are empty
   */
  function isYearEmpty(apt) {
    for (let month = 0; month < 12; month++) {
      const payment = getMonthPayment(apt, month);
      if (payment && payment.amount !== null) return false;
    }
    return true;
  }

  /**
   * Select the whole year as a yearly payment (Jan-Nov 50, Dec 0)
   */
  function selectWholeYear() {
    if (!monthlyApt) {
      showMessage(I18n.t('adminSelectApartment'), true);
      return;
    }
    if (!isYearEmpty(monthlyApt)) return;
    selectedMonths = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    wholeYear = true;
    renderMonths();
  }

  /**
   * Render the project form (open projects only)
   */
  function renderProjects() {
    const open = data.projects.filter(project => project.status === 'open');
    document.getElementById('noProjects').classList.toggle('hidden', open.length > 0);
    document.getElementById('projectFields').classList.toggle('hidden', open.length === 0);

    const select = document.getElementById('projectSelect');
    const previous = select.value;
    select.innerHTML = '';
    open.forEach(project => {
      const option = el('option', '', project.name);
      option.value = project.id;
      select.appendChild(option);
    });
    if (open.some(project => project.id === previous)) select.value = previous;
    renderProjectApartments();
  }

  /**
   * Summary of the selected project
   * @returns {Object|null} Projects.summarize() result
   */
  function getProjectSummary() {
    const project = data.projects.find(p => p.id === document.getElementById('projectSelect').value);
    return project ? Projects.summarize(project, data.projectPayments, getAptNumbers()) : null;
  }

  /**
   * Render the project apartment picker with each apartment's remaining amount
   */
  function renderProjectApartments() {
    const summary = getProjectSummary();
    if (!summary) return;

    const subtitle = apt => {
      const status = summary.apartments[apt];
      return status.remaining === 0 ? I18n.t('paid') : I18n.t('remaining').replace('{amount}', formatNumber(status.remaining));
    };
    const pick = apt => {
      projectApt = apt;
      const remaining = summary.apartments[apt].remaining;
      // A fully paid apartment starts empty, so a second payment is a deliberate choice
      document.getElementById('projectAmount').value = remaining > 0 ? remaining : '';
      renderAptPicker('projectApts', a => projectApt === a, pick, subtitle);
    };
    renderAptPicker('projectApts', a => projectApt === a, pick, subtitle);
  }

  /**
   * Fill the "paid from" picker: the building fund, then each open project
   */
  function renderExpenseFrom() {
    const select = document.getElementById('expenseFrom');
    const previous = select.value;
    while (select.options.length > 1) select.remove(1);
    data.projects.filter(project => project.status === 'open').forEach(project => {
      const option = el('option', '', project.name);
      option.value = project.id;
      select.appendChild(option);
    });
    select.value = [...select.options].some(option => option.value === previous) ? previous : '';
  }

  /**
   * Fill the expense type suggestions from existing expenses
   */
  function renderExpenseTypes() {
    const list = document.getElementById('expenseTypes');
    list.innerHTML = '';
    const counts = {};
    data.expenses.forEach(expense => {
      const type = String(expense.type).trim();
      if (type) counts[type] = (counts[type] || 0) + 1;
    });
    Object.keys(counts)
      .sort((a, b) => counts[b] - counts[a])
      .forEach(type => {
        const option = el('option');
        option.value = type;
        list.appendChild(option);
      });
  }

  /**
   * Save a monthly payment
   * @param {Event} e - Submit event
   */
  async function onSaveMonthly(e) {
    e.preventDefault();
    if (!monthlyApt) return showMessage(I18n.t('adminSelectApartment'), true);
    if (selectedMonths.size === 0) return showMessage(I18n.t('adminSelectMonths'), true);

    const year = Number(document.getElementById('monthlyYear').value);
    const amount = Number(document.getElementById('monthlyAmount').value);
    const amounts = {};
    selectedMonths.forEach(month => {
      amounts[month] = wholeYear ? (month === 11 ? 0 : MONTHLY_AMOUNT) : amount;
    });

    const result = await submit(e.target, 'monthly', { apartment: monthlyApt, year, amounts });
    if (!result.ok) return;

    const monthNames = list => list.map(month => I18n.getMonthName(month)).join(', ');
    let message = `${I18n.t('adminSaved')} · ${getDisplayName(monthlyApt)} · ${monthNames(result.written || [])} ${year}`;
    if (result.skipped && result.skipped.length > 0) {
      message += ` · ${I18n.t('adminSkipped').replace('{months}', monthNames(result.skipped))}`;
    }
    selectedMonths.clear();
    wholeYear = false;
    await reloadData(true);
    showMessage(message, false);
  }

  /**
   * Save a project payment
   * @param {Event} e - Submit event
   */
  async function onSaveProject(e) {
    e.preventDefault();
    if (!projectApt) return showMessage(I18n.t('adminSelectApartment'), true);

    const summary = getProjectSummary();
    const amount = Number(document.getElementById('projectAmount').value);
    const method = document.querySelector('input[name="method"]:checked').value;
    const result = await submit(e.target, 'project', {
      projectId: summary.project.id,
      apartment: projectApt,
      amount,
      date: document.getElementById('projectDate').value,
      method
    });
    if (!result.ok) return;

    const message = `${I18n.t('adminSaved')} · ${summary.project.name} · ${getDisplayName(projectApt)} · ${formatNumber(amount)} ₪`;
    projectApt = null;
    await reloadData(true);
    showMessage(message, false);
  }

  /**
   * Save an expense
   * @param {Event} e - Submit event
   */
  async function onSaveExpense(e) {
    e.preventDefault();
    const type = document.getElementById('expenseType').value.trim();
    const amount = Number(document.getElementById('expenseAmount').value);
    const projectId = document.getElementById('expenseFrom').value;
    const project = data.projects.find(p => p.id === projectId);
    const payload = { type, amount, date: document.getElementById('expenseDate').value };
    if (projectId) payload.projectId = projectId;
    if (receiptFile) payload.receiptFile = receiptFile;
    // Money from a project's pot goes to ProjectExpenses, otherwise to the building fund's Expence tab
    const result = await submit(e.target, projectId ? 'projectExpense' : 'expense', payload);
    if (!result.ok) return;

    const hasReceipt = Boolean(receiptFile);
    e.target.reset();
    clearReceipt();
    await reloadData(true);
    document.getElementById('expenseDate').value = todayIso();
    const from = project ? ` · ${project.name}` : '';
    showMessage(`${I18n.t('adminSaved')}${from} · ${type} · ${formatNumber(amount)} ₪${hasReceipt ? ' · 📎' : ''}`, false);
  }

  /**
   * Prepare the picked receipt: photos are shrunk to a JPEG, PDFs are sent as they are
   * @param {Event} e - Change event of the file input
   */
  async function onPickReceipt(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    hideMessage();

    try {
      if (file.type === 'application/pdf') {
        if (file.size > RECEIPT_MAX_BYTES) throw new Error('too_large');
        receiptFile = { name: file.name, mimeType: file.type, data: await readBase64(file) };
      } else if (file.type.startsWith('image/')) {
        receiptFile = { name: file.name, ...(await shrinkImage(file)) };
      } else {
        throw new Error('unsupported');
      }
      showReceiptPreview(file);
    } catch (error) {
      clearReceipt();
      showMessage(I18n.t(error.message === 'too_large' ? 'adminReceiptTooLarge' : 'adminReceiptUnsupported'), true);
    }
  }

  /**
   * Shrink a photo to at most RECEIPT_MAX_SIDE pixels and re-encode it as JPEG
   * @param {File} file - Image file
   * @returns {Promise<Object>} { mimeType, data (base64) }
   */
  async function shrinkImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('unsupported'));
        img.src = url;
      });
      const scale = Math.min(1, RECEIPT_MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.naturalWidth * scale);
      canvas.height = Math.round(image.naturalHeight * scale);
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
      if (data.length * 3 / 4 > RECEIPT_MAX_BYTES) throw new Error('too_large');
      return { mimeType: 'image/jpeg', data };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /**
   * Read a file as base64 (without the data: prefix)
   * @param {File} file - File
   * @returns {Promise<string>} Base64 data
   */
  function readBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = () => reject(new Error('unsupported'));
      reader.readAsDataURL(file);
    });
  }

  /**
   * Show the picked receipt under the button
   * @param {File} file - Picked file
   */
  function showReceiptPreview(file) {
    const thumb = document.getElementById('receiptThumb');
    const isPdf = receiptFile.mimeType === 'application/pdf';
    thumb.classList.toggle('hidden', isPdf);
    document.getElementById('receiptIcon').classList.toggle('hidden', !isPdf);
    if (!isPdf) thumb.src = `data:image/jpeg;base64,${receiptFile.data}`;
    document.getElementById('receiptName').textContent = file.name;
    document.getElementById('receiptPicker').classList.add('hidden');
    document.getElementById('receiptPreview').classList.remove('hidden');
  }

  /**
   * Remove the picked receipt
   */
  function clearReceipt() {
    receiptFile = null;
    document.getElementById('expenseReceipt').value = '';
    document.getElementById('receiptThumb').removeAttribute('src');
    document.getElementById('receiptPreview').classList.add('hidden');
    document.getElementById('receiptPicker').classList.remove('hidden');
  }

  /**
   * Send an action with the form's save button disabled
   * @param {HTMLFormElement} form - The form being saved
   * @param {string} action - Admin action
   * @param {Object} payload - Action fields
   * @returns {Promise<Object>} Web app response
   */
  async function submit(form, action, payload) {
    const button = form.querySelector('.admin-submit');
    button.disabled = true;
    button.textContent = I18n.t('adminSaving');
    hideMessage();

    const key = `${action}:${JSON.stringify(payload)}`;
    if (!pendingRequest || pendingRequest.key !== key) {
      pendingRequest = { key, id: newRequestId() };
    }
    const result = await AdminAPI.call(action, payload, pendingRequest.id);
    if (result.ok) pendingRequest = null;

    button.disabled = false;
    button.textContent = I18n.t('adminSave');

    if (!result.ok) {
      if (result.error === 'bad_pin' || result.error === 'locked') {
        AdminAPI.logout();
        showPinScreen();
        const errorEl = document.getElementById('pinError');
        errorEl.textContent = describeError(result);
        errorEl.classList.remove('hidden');
      } else {
        showMessage(describeError(result), true);
      }
    }
    return result;
  }

  /**
   * A random id for one save attempt
   * @returns {string} UUID
   */
  function newRequestId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
  }

  /**
   * Show the status banner
   * @param {string} text - Message
   * @param {boolean} isError - Error styling
   */
  function showMessage(text, isError) {
    const message = document.getElementById('adminMessage');
    message.textContent = text;
    message.classList.toggle('admin-message--error', isError);
    message.classList.remove('hidden');
    message.scrollIntoView({ block: 'nearest' });
  }

  /**
   * Hide the status banner
   */
  function hideMessage() {
    document.getElementById('adminMessage').classList.add('hidden');
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
    // Small delay to ensure i18n is initialized
    setTimeout(init, 100);
  });

  return {
    init
  };
})();
