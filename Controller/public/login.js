// redirect if already logged in
if (localStorage.getItem('accessToken')) {
  window.location.replace('index.html');
}

document.getElementById('login-btn').addEventListener('click', async () => {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const errorEl = document.getElementById('error');
  errorEl.textContent = '';
  if (!username || !password) {
    errorEl.innerHTML = `<span style="color: #f44336; font-weight: bold;">Please enter username and password</span>`;
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
        errorEl.innerHTML = data.message ? `<span style="color: #f44336; font-weight: bold;">${data.message}</span>` : `<span style="color: #f44336; font-weight: bold;">Login failed</span>`;
      }
      return;
    }
    localStorage.setItem('accessToken', data.token);
    if (data.licenseEndDate) {
      localStorage.setItem('licenseEndDate', data.licenseEndDate);
    }
    // redirect to controller
    window.location.href = 'index.html';
  } catch (err) {
    errorEl.textContent = 'Network error';
  }
}); 