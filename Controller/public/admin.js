const token = localStorage.getItem('accessToken');
if (!token) window.location.href='login.html';
function decode(t){try{return JSON.parse(atob(t.split('.')[1]));}catch(e){return{}}}
if(decode(token).user!=='admin'){window.location.href='index.html';}
const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
const tbody=document.querySelector('#userTable tbody');

// Translation system for admin page
const adminTranslations = {
  en: {
    userAdmin: 'User Admin',
    user: 'User',
    licenseStatus: 'License Status',
    licenseEndDate: 'License End Date',
    extendLicense: 'Extend License',
    loginStatus: 'Login Status',
    action: 'Action',
    username: 'username',
    password: 'password',
    add: 'Add',
    changeAdminPassword: 'Change Admin Password',
    newPassword: 'new password',
    update: 'Update',
    licenseManagementInstructions: 'License Management Instructions',
    statusColors: 'Status Colors:',
    active: 'Active',
    activeDescription: 'License is valid and not expired',
    expired: 'Expired',
    expiredDescription: 'License has expired, user cannot login',
    noLicense: 'No License',
    noLicenseDescription: 'User has no license assigned',
    loginStatusTitle: 'Login Status:',
    online: 'Online',
    onlineDescription: 'User is currently logged in and connected',
    offline: 'Offline',
    offlineDescription: 'User is not currently logged in',
    extendLicenseDescription: 'Enter number of months and click "Extend" to add time to user\'s license',
    note: 'Note:',
    adminNote: 'Admin user has permanent license and cannot be modified',
    back: 'Back',
    logout: 'Logout',
    months: 'Months',
    extend: 'Extend',
    extending: 'Extending...',
    na: 'N/A',
    delete: 'Delete',
    confirmDelete: 'Are you sure you want to delete user',
    pleaseEnterMonths: 'Please enter a valid number of months (1-120)',
    licenseExtended: 'License extended successfully! New end date:',
    error: 'Error:',
    errorExtending: 'Error extending license:',
    passwordUpdated: 'Password updated'
  },
  th: {
    userAdmin: 'จัดการผู้ใช้',
    user: 'ผู้ใช้',
    licenseStatus: 'สถานะใบอนุญาต',
    licenseEndDate: 'วันหมดอายุใบอนุญาต',
    extendLicense: 'ขยายใบอนุญาต',
    loginStatus: 'สถานะการเข้าสู่ระบบ',
    action: 'การดำเนินการ',
    username: 'ชื่อผู้ใช้งาน',
    password: 'รหัสผ่าน',
    add: 'เพิ่ม',
    changeAdminPassword: 'เปลี่ยนรหัสผ่านผู้ดูแลระบบ',
    newPassword: 'รหัสผ่านใหม่',
    update: 'อัปเดต',
    licenseManagementInstructions: 'คำแนะนำการจัดการใบอนุญาต',
    statusColors: 'สีสถานะ:',
    active: 'ใช้งานได้',
    activeDescription: 'ใบอนุญาตยังใช้ได้และยังไม่หมดอายุ',
    expired: 'หมดอายุ',
    expiredDescription: 'ใบอนุญาตหมดอายุแล้ว ผู้ใช้ไม่สามารถเข้าสู่ระบบได้',
    noLicense: 'ไม่มีใบอนุญาต',
    noLicenseDescription: 'ผู้ใช้ไม่มีใบอนุญาต',
    loginStatusTitle: 'สถานะการเข้าสู่ระบบ:',
    online: 'ออนไลน์',
    onlineDescription: 'ผู้ใช้กำลังเข้าสู่ระบบและเชื่อมต่ออยู่',
    offline: 'ออฟไลน์',
    offlineDescription: 'ผู้ใช้ไม่ได้เข้าสู่ระบบ',
    extendLicenseDescription: 'กรอกจำนวนเดือนและคลิก "ขยาย" เพื่อเพิ่มเวลาของใบอนุญาตผู้ใช้',
    note: 'หมายเหตุ:',
    adminNote: 'ผู้ใช้ admin มีใบอนุญาตถาวรและไม่สามารถแก้ไขได้',
    back: 'กลับ',
    logout: 'ออกจากระบบ',
    months: 'เดือน',
    extend: 'ขยาย',
    extending: 'กำลังขยาย...',
    na: 'ไม่適用',
    delete: 'ลบ',
    confirmDelete: 'คุณแน่ใจหรือไม่ว่าต้องการลบผู้ใช้',
    pleaseEnterMonths: 'กรุณากรอกจำนวนเดือนที่ถูกต้อง (1-120)',
    licenseExtended: 'ขยายใบอนุญาตสำเร็จ! วันที่หมดอายุใหม่:',
    error: 'ข้อผิดพลาด:',
    errorExtending: 'ข้อผิดพลาดในการขยายใบอนุญาต:',
    passwordUpdated: 'อัปเดตรหัสผ่านแล้ว'
  }
};

// Get current language from localStorage or default to English
let currentLanguage = localStorage.getItem('language') || 'en';

// Translation function
function t(key) {
  return adminTranslations[currentLanguage][key] || adminTranslations.en[key] || key;
}

// Apply translations
function applyAdminTranslations() {
  document.querySelectorAll('[data-translate]').forEach(el => {
    const key = el.getAttribute('data-translate');
    el.textContent = t(key);
  });
  
  document.querySelectorAll('[data-translate-placeholder]').forEach(el => {
    const key = el.getAttribute('data-translate-placeholder');
    el.placeholder = t(key);
  });
}

// WebSocket connection for real-time updates
let adminWs = null;
const WS_PORT = window.location.port || (window.location.protocol === 'https:' ? '443' : '80');
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${wsProtocol}//${window.location.hostname}:${WS_PORT}`;

function connectAdminWebSocket() {
  adminWs = new WebSocket(wsUrl);
  
  adminWs.onopen = function() {
    console.log('Admin WebSocket connected');
    // Send admin authentication
    adminWs.send(JSON.stringify({
      type: 'admin_hello',
      token: token
    }));
  };
  
  adminWs.onmessage = function(event) {
    const data = JSON.parse(event.data);
    
    if (data.type === 'user_status_update') {
      // Update the table row for the specific user
      updateUserStatus(data.username, data.isOnline);
    }
  };
  
  adminWs.onclose = function() {
    console.log('Admin WebSocket disconnected, attempting to reconnect...');
    setTimeout(connectAdminWebSocket, 3000);
  };
  
  adminWs.onerror = function(error) {
    console.error('Admin WebSocket error:', error);
  };
}

function updateUserStatus(username, isOnline) {
  // Find the table row for this user and update the login status
  const rows = tbody.querySelectorAll('tr');
  rows.forEach(row => {
    const usernameCell = row.querySelector('td:first-child');
    if (usernameCell && usernameCell.textContent === username) {
      const loginStatusCell = row.querySelector('td:nth-child(5)'); // Login Status column (now 5th column)
      if (loginStatusCell) {
        loginStatusCell.textContent = isOnline ? t('online') : t('offline');
        loginStatusCell.className = isOnline ? 'login-online' : 'login-offline';
      }
    }
  });
}

// Connect to WebSocket when page loads
connectAdminWebSocket();

// Apply translations on page load
document.addEventListener('DOMContentLoaded', () => {
  applyAdminTranslations();
});

function loadUsers(){
  fetch('/api/users',{headers})
    .then(r=>r.json())
    .then(users=>{
      tbody.innerHTML='';
      users.forEach(user=>{
        const tr=document.createElement('tr');
        
        // License status styling and translation
        let statusClass = '';
        let statusText = '';
        if (user.status === 'Active') {
          statusClass = 'license-active';
          statusText = t('active');
        } else if (user.status === 'Expired') {
          statusClass = 'license-expired';
          statusText = t('expired');
        } else {
          statusClass = 'license-none';
          statusText = t('noLicense');
        }
        
        // Login status styling and translation
        let loginStatusClass = '';
        let loginStatusText = '';
        if (user.loginStatus === 'Online') {
          loginStatusClass = 'login-online';
          loginStatusText = t('online');
        } else {
          loginStatusClass = 'login-offline';
          loginStatusText = t('offline');
        }
        
        tr.innerHTML=`
          <td>${user.username}</td>
          <td class="${statusClass}">${statusText}</td>
          <td>${user.licenseEndDate}</td>
          <td>
            ${user.username === 'admin' ? t('na') : `
              <div class="extend-box">
                <input type="number" min="1" max="120" placeholder="${t('months')}" class="extend-months" data-username="${user.username}" />
                <button class="extend-btn" data-username="${user.username}">${t('extend')}</button>
              </div>
            `}
          </td>
          <td class="${loginStatusClass}">${loginStatusText}</td>
          <td>${user.username==='admin'?'':`<button class='icon-btn' data-u='${user.username}' title='${t('delete')}'>&#128465;</button>`}</td>
        `;
        tbody.appendChild(tr);
      });
      
      // Add event listeners for extend buttons
      addExtendListeners();
    });
}

function addExtendListeners() {
  document.querySelectorAll('.extend-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const username = e.target.dataset.username;
      const monthsInput = document.querySelector(`input[data-username="${username}"]`);
      const months = parseInt(monthsInput.value);
      
      if (!months || months < 1 || months > 120) {
        alert(t('pleaseEnterMonths'));
        return;
      }
      
      btn.disabled = true;
      btn.textContent = t('extending');
      
      fetch(`/api/users/${username}/license`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ months })
      })
      .then(r => r.json())
      .then(result => {
        if (result.success) {
          alert(`${t('licenseExtended')} ${result.newEndDate}`);
          loadUsers(); // Reload the table
        } else {
          alert(`${t('error')} ${result.message}`);
        }
      })
      .catch(err => {
        alert(`${t('errorExtending')} ${err.message}`);
      })
      .finally(() => {
        btn.disabled = false;
        btn.textContent = t('extend');
        monthsInput.value = '';
      });
    });
  });
}

loadUsers();

document.getElementById('addBtn').addEventListener('click',()=>{
  const u=document.getElementById('newUser').value.trim();
  const p=document.getElementById('newPass').value.trim();
  if(!u||!p)return;
  fetch('/api/users',{method:'POST',headers,body:JSON.stringify({username:u,password:p})})
    .then(r=>r.json())
    .then(()=>{
      loadUsers();
      document.getElementById('newUser').value = '';
      document.getElementById('newPass').value = '';
    });
});

tbody.addEventListener('click',(e)=>{
  if(e.target.classList.contains('icon-btn')){
    const u=e.target.dataset.u;
    if (confirm(`${t('confirmDelete')} "${u}"?`)) {
      fetch(`/api/users/${u}`,{method:'DELETE',headers}).then(()=>loadUsers());
    }
  }
});

document.getElementById('changePassBtn').addEventListener('click',()=>{
  const p=document.getElementById('newAdminPass').value.trim();
  if(!p) return;
  fetch('/api/users/admin',{method:'PUT',headers,body:JSON.stringify({password:p})}).then(r=>r.json()).then(()=>{
    alert(t('passwordUpdated'));
    document.getElementById('newAdminPass').value='';
  });
});

document.getElementById('logout').addEventListener('click',()=>{
  localStorage.removeItem('accessToken');
  window.location.href='login.html';
});

document.getElementById('backBtn').addEventListener('click',()=>{
  window.location.href='index.html';
}); 