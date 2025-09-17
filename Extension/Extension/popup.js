function updateUI(logged){
  document.getElementById('login-ui').style.display=logged?'none':'block';
  document.getElementById('logged-ui').style.display=logged?'block':'none';
}

function setToggleState(connected){
  const cb=document.getElementById('toggleConn');
  if(cb){cb.checked=connected;}
}

chrome.storage.local.get(['accessToken'], (res) => {
  const token = res.accessToken;
  updateUI(!!token);
  if(token){
    chrome.runtime.sendMessage({type:'getConnectionStatus'},(resp)=>{
      if(resp){setToggleState(resp.connected);}  });
  }
});

document.getElementById('login').addEventListener('click', async () => {
  const u = document.getElementById('username').value.trim();
  const p = document.getElementById('password').value;
  const err = document.getElementById('err');
  err.textContent='';
  if(!u||!p){err.textContent='Enter credentials';return;}
  try{
    // const r=await fetch('http://localhost:3000/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})});
    const r=await fetch('https://www.god.bet/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:u,password:p})});
    const d=await r.json();
    if(!d.success){err.textContent=d.message||'Login failed';return;}
    chrome.storage.local.set({accessToken:d.token},()=>{
      updateUI(true);
      setToggleState(true);
      chrome.runtime.sendMessage({type:'tokenUpdated'});
    });
  }catch(e){err.textContent='Network error';}
});

document.getElementById('logout').addEventListener('click',()=>{
  chrome.storage.local.remove('accessToken',()=>{
    updateUI(false);
    chrome.runtime.sendMessage({type:'logout'});
  });
});

// toggle connection switch
document.getElementById('toggleConn').addEventListener('change',(e)=>{
  if(e.target.checked){
    chrome.runtime.sendMessage({type:'connectReq'});
  }else{
    chrome.runtime.sendMessage({type:'disconnectReq'});
  }
});

chrome.runtime.onMessage.addListener((msg)=>{
  if(msg.type==='statusUpdate'){
    setToggleState(msg.connected);
  }
  if(msg.type==='autoLogout'){
    // Force UI to logged-out state
    chrome.storage.local.remove('accessToken',()=>{
      updateUI(false);
      setToggleState(false);
      const err = document.getElementById('err');
      if(err){err.textContent= msg.reason || 'Session expired. Please login again.';}
    });
  }
}); 