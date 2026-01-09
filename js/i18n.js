/**
 * Internationalization (i18n) Module
 * Supports Hebrew, English, Arabic, Russian, Ukrainian
 */

const I18n = (function() {
  const STORAGE_KEY = 'manzel_language';
  const RTL_LANGUAGES = ['he', 'ar'];

  const translations = {
    he: {
      buildingAddress: 'דרך אלנבי 131א, חיפה',
      title: 'ניהול בניין',
      subtitle: 'מעקב תשלומים והוצאות',
      totalFund: 'קופת ועד בית',
      currency: '₪',
      building: 'הבניין',
      expenses: 'הוצאות',
      expenseType: 'סוג',
      expensePrice: 'מחיר',
      expenseReceipt: 'קבלה',
      expenseNotes: 'הערות',
      viewReceipt: 'צפה בקבלה',
      floor: 'קומה',
      apartment: 'דירה',
      residentDetails: 'פרטי דייר',
      back: 'חזרה',
      amountOwed: 'חוב עד החודש הנוכחי',
      paymentHistory: 'היסטוריית תשלומים',
      paid: 'שולם',
      notPaid: 'לא שולם',
      partial: 'חלקי',
      months: ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'],
      noDebt: 'אין חוב',
      lastYearOwed: 'חוב משנה שעברה',
      loading: 'טוען...',
      error: 'שגיאה בטעינת הנתונים',
      payNow: 'תשלום',
      paymentTitle: 'תשלום עבור ועד בית',
      paymentMonthly: 'בעל דירה מחוייב בתשלום 50 שקלים עבור כל חודש.',
      paymentDiscount: 'הנחה למשלמים מראש עבור כל השנה 550 שקל בלבד (במקום 600)',
      paymentMethods: 'לנוחיותכם ניתן לשלם באמצעות אחת הדרכים הבאות:',
      paymentCash: 'מזומן'
    },
    en: {
      buildingAddress: 'Derech Allenby 131A, Haifa',
      title: 'Building Management',
      subtitle: 'Payment and expense tracking',
      totalFund: 'Building Maintenance Fund',
      currency: '₪',
      building: 'Building',
      expenses: 'Expenses',
      expenseType: 'Type',
      expensePrice: 'Price',
      expenseReceipt: 'Receipt',
      expenseNotes: 'Notes',
      viewReceipt: 'View Receipt',
      floor: 'Floor',
      apartment: 'Apt',
      residentDetails: 'Resident Details',
      back: 'Back',
      amountOwed: 'Amount owed until this month',
      paymentHistory: 'Payment History',
      paid: 'Paid',
      notPaid: 'Not paid',
      partial: 'Partial',
      months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
      noDebt: 'No debt',
      lastYearOwed: 'Last year debt',
      loading: 'Loading...',
      error: 'Error loading data',
      payNow: 'Pay',
      paymentTitle: 'Building Committee Payment',
      paymentMonthly: 'Apartment owners are required to pay 50 shekels per month.',
      paymentDiscount: 'Discount for paying in advance for the whole year: only 550 shekels (instead of 600)',
      paymentMethods: 'For your convenience, you can pay using one of the following methods:',
      paymentCash: 'Cash'
    },
    ar: {
      buildingAddress: 'شارع أللنبي 131أ، حيفا',
      title: 'إدارة المبنى',
      subtitle: 'تتبع المدفوعات والمصروفات',
      totalFund: 'صندوق صيانة المبنى',
      currency: '₪',
      building: 'المبنى',
      expenses: 'المصروفات',
      expenseType: 'النوع',
      expensePrice: 'السعر',
      expenseReceipt: 'الإيصال',
      expenseNotes: 'ملاحظات',
      viewReceipt: 'عرض الإيصال',
      floor: 'طابق',
      apartment: 'شقة',
      residentDetails: 'تفاصيل المقيم',
      back: 'رجوع',
      amountOwed: 'المبلغ المستحق حتى هذا الشهر',
      paymentHistory: 'سجل الدفعات',
      paid: 'مدفوع',
      notPaid: 'غير مدفوع',
      partial: 'جزئي',
      months: ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'],
      noDebt: 'لا يوجد دين',
      lastYearOwed: 'دين السنة الماضية',
      loading: 'جار التحميل...',
      error: 'خطأ في تحميل البيانات',
      payNow: 'دفع',
      paymentTitle: 'دفع لجنة المبنى',
      paymentMonthly: 'يجب على صاحب الشقة دفع 50 شيكل عن كل شهر.',
      paymentDiscount: 'خصم للدفع المسبق للسنة كاملة: 550 شيكل فقط (بدلاً من 600)',
      paymentMethods: 'لراحتكم، يمكنكم الدفع بإحدى الطرق التالية:',
      paymentCash: 'نقداً'
    },
    ru: {
      buildingAddress: 'Дерех Алленби 131А, Хайфа',
      title: 'Управление зданием',
      subtitle: 'Отслеживание платежей и расходов',
      totalFund: 'Фонд обслуживания здания',
      currency: '₪',
      building: 'Здание',
      expenses: 'Расходы',
      expenseType: 'Тип',
      expensePrice: 'Цена',
      expenseReceipt: 'Квитанция',
      expenseNotes: 'Примечания',
      viewReceipt: 'Посмотреть квитанцию',
      floor: 'Этаж',
      apartment: 'Кв.',
      residentDetails: 'Данные жильца',
      back: 'Назад',
      amountOwed: 'Сумма долга до текущего месяца',
      paymentHistory: 'История платежей',
      paid: 'Оплачено',
      notPaid: 'Не оплачено',
      partial: 'Частично',
      months: ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'],
      noDebt: 'Нет долга',
      lastYearOwed: 'Долг за прошлый год',
      loading: 'Загрузка...',
      error: 'Ошибка загрузки данных',
      payNow: 'Оплата',
      paymentTitle: 'Оплата домового комитета',
      paymentMonthly: 'Владелец квартиры обязан платить 50 шекелей в месяц.',
      paymentDiscount: 'Скидка при оплате вперёд за весь год: всего 550 шекелей (вместо 600)',
      paymentMethods: 'Для вашего удобства можно оплатить одним из следующих способов:',
      paymentCash: 'Наличные'
    },
    uk: {
      buildingAddress: 'Дерех Алленбі 131А, Хайфа',
      title: 'Управління будинком',
      subtitle: 'Відстеження платежів та витрат',
      totalFund: 'Фонд утримання будинку',
      currency: '₪',
      building: 'Будинок',
      expenses: 'Витрати',
      expenseType: 'Тип',
      expensePrice: 'Ціна',
      expenseReceipt: 'Квитанція',
      expenseNotes: 'Примітки',
      viewReceipt: 'Переглянути квитанцію',
      floor: 'Поверх',
      apartment: 'Кв.',
      residentDetails: 'Дані мешканця',
      back: 'Назад',
      amountOwed: 'Сума боргу до поточного місяця',
      paymentHistory: 'Історія платежів',
      paid: 'Сплачено',
      notPaid: 'Не сплачено',
      partial: 'Частково',
      months: ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'],
      noDebt: 'Немає боргу',
      lastYearOwed: 'Борг за минулий рік',
      loading: 'Завантаження...',
      error: 'Помилка завантаження даних',
      payNow: 'Оплата',
      paymentTitle: 'Оплата будинкового комітету',
      paymentMonthly: 'Власник квартири зобов\'язаний сплачувати 50 шекелів щомісяця.',
      paymentDiscount: 'Знижка при оплаті наперед за весь рік: лише 550 шекелів (замість 600)',
      paymentMethods: 'Для вашої зручності можна оплатити одним із наступних способів:',
      paymentCash: 'Готівка'
    }
  };

  let currentLanguage = 'he';

  /**
   * Detect system language
   * @returns {string} Language code
   */
  function detectLanguage() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && translations[stored]) {
      return stored;
    }

    const browserLang = navigator.language.split('-')[0];
    if (translations[browserLang]) {
      return browserLang;
    }

    return 'he'; // Default to Hebrew
  }

  /**
   * Set the current language
   * @param {string} lang - Language code
   */
  function setLanguage(lang) {
    if (!translations[lang]) {
      console.warn(`Language "${lang}" not supported`);
      return;
    }

    currentLanguage = lang;
    localStorage.setItem(STORAGE_KEY, lang);

    // Update document direction
    const isRTL = RTL_LANGUAGES.includes(lang);
    document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
    document.documentElement.lang = lang;

    // Update all translatable elements
    updateDOM();

    // Update language dropdown
    updateLanguageDropdown();
  }

  /**
   * Get translation for a key
   * @param {string} key - Translation key
   * @returns {string} Translated text
   */
  function t(key) {
    return translations[currentLanguage][key] || translations['he'][key] || key;
  }

  /**
   * Get month name
   * @param {number} index - Month index (0-11)
   * @returns {string} Month name
   */
  function getMonthName(index) {
    return translations[currentLanguage].months[index] || translations['he'].months[index];
  }

  /**
   * Update all DOM elements with data-i18n attribute
   */
  function updateDOM() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      el.textContent = t(key);
    });

    // Update month elements
    document.querySelectorAll('[data-i18n-month]').forEach(el => {
      const monthIndex = parseInt(el.getAttribute('data-i18n-month'), 10);
      el.textContent = getMonthName(monthIndex);
    });
  }

  /**
   * Update language dropdown selection
   */
  function updateLanguageDropdown() {
    const dropdown = document.getElementById('languageSelector');
    if (dropdown) {
      dropdown.value = currentLanguage;
    }
  }

  /**
   * Initialize i18n system
   */
  function init() {
    // Set initial language
    const lang = detectLanguage();
    setLanguage(lang);

    // Set up language dropdown event listener
    const dropdown = document.getElementById('languageSelector');
    if (dropdown) {
      dropdown.value = currentLanguage;
      dropdown.addEventListener('change', (e) => {
        setLanguage(e.target.value);
      });
    }
  }

  /**
   * Get current language
   * @returns {string} Current language code
   */
  function getCurrentLanguage() {
    return currentLanguage;
  }

  /**
   * Check if current language is RTL
   * @returns {boolean} True if RTL
   */
  function isRTL() {
    return RTL_LANGUAGES.includes(currentLanguage);
  }

  // Public API
  return {
    init,
    setLanguage,
    t,
    getMonthName,
    getCurrentLanguage,
    isRTL
  };
})();

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  I18n.init();
});
