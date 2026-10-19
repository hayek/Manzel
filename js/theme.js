/**
 * Theme Toggle
 * Light / Auto / Dark picker in the footer; preference stored in localStorage (manzel_theme)
 */

(function() {
  var toggle = document.getElementById('themeToggle');
  var btn = document.getElementById('themeBtn');
  var menu = document.getElementById('themeMenu');
  var icon = document.getElementById('themeIcon');
  var label = document.getElementById('themeLabel');
  var saved = localStorage.getItem('manzel_theme') || 'auto';

  var icons = {
    light: '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>',
    auto: '<circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 0 0 20V2z" fill="currentColor"/>',
    dark: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>'
  };

  function applyTheme(theme) {
    if (theme === 'auto') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
    icon.innerHTML = icons[theme];
    var item = menu.querySelector('[data-theme="' + theme + '"]');
    if (item) label.setAttribute('data-i18n', item.querySelector('[data-i18n]').getAttribute('data-i18n'));
    label.textContent = item ? item.querySelector('span').textContent : theme;
    menu.querySelectorAll('li').forEach(function(li) {
      li.setAttribute('aria-selected', li.dataset.theme === theme ? 'true' : 'false');
    });
    localStorage.setItem('manzel_theme', theme);
  }

  applyTheme(saved);

  btn.addEventListener('click', function(e) {
    e.stopPropagation();
    var isOpen = toggle.classList.toggle('theme-toggle--open');
    btn.setAttribute('aria-expanded', isOpen);
  });

  menu.addEventListener('click', function(e) {
    var item = e.target.closest('li[data-theme]');
    if (item) {
      applyTheme(item.dataset.theme);
      toggle.classList.remove('theme-toggle--open');
      btn.setAttribute('aria-expanded', 'false');
    }
  });

  document.addEventListener('click', function() {
    toggle.classList.remove('theme-toggle--open');
    btn.setAttribute('aria-expanded', 'false');
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      toggle.classList.remove('theme-toggle--open');
      btn.setAttribute('aria-expanded', 'false');
    }
  });
})();
