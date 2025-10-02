# 📥 Export User Data from Deployed Project

This guide explains how to download current user data (including password hashes) from your deployed Railway application.

## 🚀 Quick Steps

### 1. Get Railway URL
```bash
cd Controller
railway domain
```

### 2. Login to Admin Interface
1. Go to: `https://your-app.railway.app/admin.html`
2. Login with admin credentials
3. Open Developer Tools (F12) → Console
4. Run this JavaScript to get your token:
```javascript
const token = localStorage.getItem('token');
console.log('Admin token:', token);
```

### 3. Export User Data
```bash
curl -H "Authorization: Bearer YOUR_ADMIN_TOKEN" "https://your-app.railway.app/api/export-users" > live_users_complete.json
```

### 4. Update Local File
Create `extract_users.js`:
```javascript
const fs = require('fs');

// Read the live data
const liveData = JSON.parse(fs.readFileSync('live_users_complete.json', 'utf8'));

// Extract just the users object
const users = liveData.users;

// Write to users.json
fs.writeFileSync('users.json', JSON.stringify(users, null, 2));

console.log('✅ Updated users.json with', Object.keys(users).length, 'users');
console.log('Users:', Object.keys(users).join(', '));
console.log('Exported by:', liveData.exportedBy);
console.log('Export time:', liveData.exportTime);
```

Run it:
```bash
node extract_users.js
```

## 🔧 API Endpoint Details

### Export Endpoint
- **URL**: `/api/export-users`
- **Method**: `GET`
- **Authentication**: Bearer token (admin only)
- **Response**: Complete user data with password hashes

### Response Format
```json
{
  "success": true,
  "users": {
    "admin": {
      "passwordHash": "$2a$10$...",
      "licenseEndDate": "2099-12-31"
    },
    "user1": {
      "passwordHash": "$2a$10$...",
      "licenseEndDate": "2025-10-07"
    }
  },
  "exportTime": "2025-01-30T10:30:00.000Z",
  "totalUsers": 4,
  "exportedBy": "admin"
}
```

## 🔒 Security Features

- ✅ **Admin Authentication Required**: Only authenticated admin can export
- ✅ **JWT Token Security**: Requires valid admin JWT token
- ✅ **Complete Data Export**: Includes all users with password hashes
- ✅ **Audit Trail**: Shows who exported the data and when

## 🚨 Important Notes

1. **Token Expiration**: Admin tokens expire after 1 hour
2. **Password Hashes**: Exported data includes bcrypt password hashes
3. **File Persistence**: Changes to `users.json` persist between deployments
4. **Backup Safety**: Always backup before redeploying

## 🛠️ Troubleshooting

### 403 Forbidden Error
- Make sure you're logged in as admin
- Check if your token is still valid (tokens expire after 1 hour)
- Verify you're using the correct URL

### 401 Unauthorized Error
- Token might be expired - login again to get a new token
- Check if the token is copied correctly

### Connection Error
- Verify your Railway URL is correct
- Check if the application is running: `railway logs`

## 📋 Complete Workflow

```bash
# 1. Navigate to project
cd Controller

# 2. Get Railway URL
railway domain

# 3. Login to admin and get token (manual step in browser)

# 4. Export user data
curl -H "Authorization: Bearer YOUR_TOKEN" "https://your-app.railway.app/api/export-users" > live_users_complete.json

# 5. Extract and update local file
node extract_users.js

# 6. Verify the update
type users.json
```

## 🎯 Use Cases

- **Before Redeployment**: Backup current user data
- **Data Migration**: Move users between environments
- **Backup Creation**: Regular data backups
- **User Analysis**: Export user data for analysis
- **Disaster Recovery**: Restore user data after issues

---

**💡 Pro Tip**: Always export user data before making any changes to ensure you don't lose any user information!
