const token = localStorage.getItem('accessToken');
if (!token) window.location.href='login.html';
function decode(t){try{return JSON.parse(atob(t.split('.')[1]));}catch(e){return{}}}
if(decode(token).user!=='admin'){window.location.href='index.html';}
const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
const tbody=document.querySelector('#userTable tbody');

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
        loginStatusCell.textContent = isOnline ? 'Online' : 'Offline';
        loginStatusCell.className = isOnline ? 'login-online' : 'login-offline';
      }
    }
  });
}

// Connect to WebSocket when page loads
connectAdminWebSocket();

function loadUsers(){
  fetch('/api/users',{headers})
    .then(r=>r.json())
    .then(users=>{
      tbody.innerHTML='';
      users.forEach(user=>{
        const tr=document.createElement('tr');
        
        // License status styling
        let statusClass = '';
        if (user.status === 'Active') statusClass = 'license-active';
        else if (user.status === 'Expired') statusClass = 'license-expired';
        else statusClass = 'license-none';
        
        // Login status styling
        let loginStatusClass = '';
        if (user.loginStatus === 'Online') loginStatusClass = 'login-online';
        else loginStatusClass = 'login-offline';
        
        tr.innerHTML=`
          <td>${user.username}</td>
          <td class="${statusClass}">${user.status}</td>
          <td>${user.licenseEndDate}</td>
          <td>
            ${user.username === 'admin' ? 'N/A' : `
              <div class="extend-box">
                <input type="number" min="1" max="120" placeholder="Months" class="extend-months" data-username="${user.username}" />
                <button class="extend-btn" data-username="${user.username}">Extend</button>
              </div>
            `}
          </td>
          <td class="${loginStatusClass}">${user.loginStatus}</td>
          <td>${user.username==='admin'?'':`<button class='icon-btn' data-u='${user.username}' title='Delete'>&#128465;</button>`}</td>
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
        alert('Please enter a valid number of months (1-120)');
        return;
      }
      
      btn.disabled = true;
      btn.textContent = 'Extending...';
      
      fetch(`/api/users/${username}/license`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ months })
      })
      .then(r => r.json())
      .then(result => {
        if (result.success) {
          alert(`License extended successfully! New end date: ${result.newEndDate}`);
          loadUsers(); // Reload the table
        } else {
          alert('Error: ' + result.message);
        }
      })
      .catch(err => {
        alert('Error extending license: ' + err.message);
      })
      .finally(() => {
        btn.disabled = false;
        btn.textContent = 'Extend';
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
    if (confirm(`Are you sure you want to delete user "${u}"?`)) {
      fetch(`/api/users/${u}`,{method:'DELETE',headers}).then(()=>loadUsers());
    }
  }
});

document.getElementById('changePassBtn').addEventListener('click',()=>{
  const p=document.getElementById('newAdminPass').value.trim();
  if(!p) return;
  fetch('/api/users/admin',{method:'PUT',headers,body:JSON.stringify({password:p})}).then(r=>r.json()).then(()=>{
    alert('Password updated');
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