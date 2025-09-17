# 🚀 Railway Deployment Scripts

Easy deployment scripts for the Bet Controller to Railway.

## 📁 Files

- `deploy-railway.bat` - Windows deployment script
- `deploy-railway.sh` - Linux/Mac deployment script

## 🖥️ Windows Usage

Double-click the batch file or run from command prompt:

```cmd
deploy-railway.bat
```

## 🐧 Linux/Mac Usage

Run from terminal:

```bash
./deploy-railway.sh
```

## ✨ What the Scripts Do

1. **✅ Check Railway CLI** - Installs if missing
2. **✅ Login Check** - Prompts login if needed
3. **✅ Project Linking** - Links to Railway project
4. **✅ Deploy** - Uploads and deploys your code
5. **✅ Success Info** - Shows your live URL and useful commands

## 🌐 Your Live URLs

After deployment, your app will be available at:
- **Main App**: https://bet-automation-controller-production.up.railway.app
- **Login**: https://bet-automation-controller-production.up.railway.app/login.html
- **Admin**: https://bet-automation-controller-production.up.railway.app/admin.html

## 🔧 Useful Railway Commands

```bash
railway logs     # View application logs
railway status   # Check deployment status  
railway domain   # Get your app URL
railway up       # Deploy again
```

## 📊 Monitor Your App

Visit the Railway dashboard: https://railway.com/dashboard

## 🆘 Troubleshooting

If deployment fails:
1. Check your internet connection
2. Verify Railway CLI is installed: `railway --version`
3. Check if you're logged in: `railway whoami`
4. View logs: `railway logs` 