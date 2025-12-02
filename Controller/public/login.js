// redirect if already logged in
if (localStorage.getItem('accessToken')) {
  window.location.replace('index.html');
}

// Translation system for login page
const loginTranslations = {
  en: {
    login: 'Login',
    username: 'Username',
    password: 'Password',
    pleaseEnterCredentials: 'Please enter username and password',
    loginFailed: 'Login failed',
    networkError: 'Network error'
  },
  th: {
    login: 'เข้าสู่ระบบ',
    username: 'ชื่อผู้ใช้งาน',
    password: 'รหัสผ่าน',
    pleaseEnterCredentials: 'กรุณากรอกชื่อผู้ใช้งานและรหัสผ่าน',
    loginFailed: 'เข้าสู่ระบบล้มเหลว',
    networkError: 'ข้อผิดพลาดเครือข่าย'
  }
};

// Get current language from localStorage or default to English
let currentLanguage = localStorage.getItem('language') || 'en';

// Translation function
function t(key) {
  return loginTranslations[currentLanguage][key] || loginTranslations.en[key] || key;
}

// Apply translations
function applyLoginTranslations() {
  document.querySelectorAll('[data-translate]').forEach(el => {
    const key = el.getAttribute('data-translate');
    el.textContent = t(key);
  });
  
  document.querySelectorAll('[data-translate-placeholder]').forEach(el => {
    const key = el.getAttribute('data-translate-placeholder');
    el.placeholder = t(key);
  });
}

// Initialize language selector
function initLoginLanguageSelector() {
  const langSelectorBtn = document.getElementById('lang-selector-btn');
  const langSelectorText = document.getElementById('lang-selector-text');
  const langDropdownMenu = document.getElementById('lang-dropdown-menu');
  const langOptions = document.querySelectorAll('.lang-option');
  
  if (langSelectorBtn && langSelectorText && langDropdownMenu) {
    // Set initial text
    updateLoginLanguageSelectorText();
    
    // Toggle dropdown on button click
    langSelectorBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = langDropdownMenu.style.display !== 'none';
      langDropdownMenu.style.display = isVisible ? 'none' : 'block';
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!langSelectorBtn.contains(e.target) && !langDropdownMenu.contains(e.target)) {
        langDropdownMenu.style.display = 'none';
      }
    });
    
    // Handle language option clicks
    langOptions.forEach(option => {
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        const selectedLang = option.getAttribute('data-lang');
        currentLanguage = selectedLang;
        localStorage.setItem('language', selectedLang);
        updateLoginLanguageSelectorText();
        langDropdownMenu.style.display = 'none';
        applyLoginTranslations();
      });
    });
  }
}

// Update language selector button text
function updateLoginLanguageSelectorText() {
  const langSelectorText = document.getElementById('lang-selector-text');
  if (langSelectorText) {
    langSelectorText.textContent = currentLanguage === 'en' ? 'English' : 'ไทย';
  }
}

// Apply translations on page load
document.addEventListener('DOMContentLoaded', () => {
  initLoginLanguageSelector();
  applyLoginTranslations();
});

document.getElementById('login-btn').addEventListener('click', async () => {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const errorEl = document.getElementById('error');
  errorEl.textContent = '';
  if (!username || !password) {
    errorEl.innerHTML = `<span style="color: #f44336; font-weight: bold;">${t('pleaseEnterCredentials')}</span>`;
    return;
  }
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    console.log("data", data);
    if (!data.success) {
      if (data.licenseExpired) {
        errorEl.innerHTML = `<span style="color: #f44336; font-weight: bold;">${data.message}</span>`;
      } else if (data.noLicense) {
        errorEl.innerHTML = `<span style="color: #ff9800; font-weight: bold;">${data.message}</span>`;
      } else {
        errorEl.innerHTML = data.message ? `<span style="color: #f44336; font-weight: bold;">${data.message}</span>` : `<span style="color: #f44336; font-weight: bold;">${t('loginFailed')}</span>`;
      }
      return;
    }
    localStorage.setItem('accessToken', data.token);
    if (data.refreshToken) {
      localStorage.setItem('refreshToken', data.refreshToken);
    }
    if (data.licenseEndDate) {
      localStorage.setItem('licenseEndDate', data.licenseEndDate);
    }
    // redirect to controller
    window.location.href = 'index.html';
  } catch (err) {
    errorEl.textContent = t('networkError');
  }
}); 