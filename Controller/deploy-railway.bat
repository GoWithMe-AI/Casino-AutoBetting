@echo off
echo ========================================
echo   Railway Deployment - Bet Controller
echo ========================================
echo.

REM Check if Railway CLI is installed
railway --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Railway CLI not found. Installing...
    npm install -g @railway/cli
    if errorlevel 1 (
        echo ❌ Failed to install Railway CLI
        pause
        exit /b 1
    )
    echo ✅ Railway CLI installed successfully
)

REM Check if user is logged in
railway whoami >nul 2>&1
if errorlevel 1 (
    echo 🔐 Please login to Railway...
    railway login
    if errorlevel 1 (
        echo ❌ Login failed
        pause
        exit /b 1
    )
)

echo ✅ Logged in to Railway

REM Check if project is linked
railway status >nul 2>&1
if errorlevel 1 (
    echo 🔗 Linking to Railway project...
    railway init
    if errorlevel 1 (
        echo ❌ Failed to link project
        pause
        exit /b 1
    )
)

echo ✅ Project linked to Railway

REM Deploy to Railway
echo 📦 Deploying to Railway...
echo.
railway up
if errorlevel 1 (
    echo ❌ Deployment failed
    pause
    exit /b 1
)

echo.
echo ========================================
echo ✅ Deployment completed successfully!
echo ========================================
echo.
echo 🌐 Your application is now live at:
railway domain 2>nul
echo.
echo 📊 Monitor your deployment:
echo https://railway.com/dashboard
echo.
echo 🔧 Useful commands:
echo   railway logs    - View application logs
echo   railway status  - Check deployment status
echo   railway domain  - Get your app URL
echo   railway up      - Deploy again
echo.
pause 