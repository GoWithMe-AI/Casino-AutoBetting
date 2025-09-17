# Deploying Controller to Railway

## ✅ Full Functionality Support

Railway supports **both HTTP and WebSocket** functionality, making it the ideal choice for the Controller:

- ✅ HTTP API endpoints (login, user management, license management)
- ✅ Static file serving (HTML, CSS, JS)
- ✅ WebSocket connections (real-time communication with desktop app)
- ✅ Real-time status updates

## 🚀 Deployment Steps

### 1. Install Railway CLI
```bash
npm install -g @railway/cli
```

### 2. Login to Railway
```bash
railway login
```

### 3. Initialize Railway Project
```bash
cd Controller
railway init
```

### 4. Set Environment Variables
```bash
railway variables set JWT_SECRET=your_secure_jwt_secret_here
```

### 5. Deploy
```bash
railway up
```

### 6. Get Your Domain
```bash
railway domain
```

## 🔧 Configuration Files

### railway.json
- Configures the build and deployment process
- Sets health check and restart policies
- Uses Nixpacks for automatic dependency detection

### package.json
- Standard Node.js configuration
- Railway will automatically detect and install dependencies

## 📁 File Structure
```
Controller/
├── server.js              # Main server file (HTTP + WebSocket)
├── public/                # Static files
├── users.json             # User data
├── package.json           # Dependencies
├── railway.json           # Railway configuration
└── README_RAILWAY.md      # This file
```

## 🔄 Railway vs Vercel Comparison

| Feature | Railway | Vercel |
|---------|---------|--------|
| WebSocket Support | ✅ Full | ❌ None |
| HTTP API | ✅ Full | ✅ Full |
| Static Files | ✅ Full | ✅ Full |
| Real-time Updates | ✅ Full | ❌ None |
| Free Tier | ✅ Yes | ✅ Yes |
| Deployment Speed | Fast | Very Fast |
| Custom Domains | ✅ Yes | ✅ Yes |

## 🛠️ Local Development

For local development:

```bash
cd Controller
npm install
npm run dev
```

This will start both:
- HTTP server on port 3000
- WebSocket server on port 8080

## 🔍 Testing the Deployment

### Test HTTP API
```bash
curl -X POST https://your-railway-app.railway.app/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}'
```

### Test WebSocket
The desktop app should be able to connect to:
```
ws://your-railway-app.railway.app:8080
```

### Test Static Files
Visit: `https://your-railway-app.railway.app/login.html`

## 🔧 Environment Variables

Set these in Railway dashboard or CLI:

```bash
railway variables set JWT_SECRET=your_secure_secret_here
railway variables set NODE_ENV=production
```

## 📊 Monitoring

Monitor your deployment in Railway dashboard:
- Function logs
- Performance metrics
- Error tracking
- Resource usage

## 🚨 Important Notes

1. **Full WebSocket Support**: Unlike Vercel, Railway supports WebSocket connections
2. **File Persistence**: `users.json` changes will persist between deployments
3. **Environment Variables**: Make sure to set `JWT_SECRET` in Railway dashboard
4. **CORS**: CORS is enabled for all origins (you may want to restrict this in production)
5. **Port Configuration**: Railway automatically assigns ports, but the app uses environment variables

## 🔧 Custom Domain

To use a custom domain:

1. Add domain in Railway dashboard
2. Configure DNS records as instructed
3. Wait for DNS propagation

## 💰 Pricing

Railway offers:
- **Free Tier**: $5 credit monthly
- **Pro Plan**: Pay-as-you-go
- **Team Plan**: Shared resources

## 🚀 Quick Deploy Button

You can also deploy directly from GitHub:

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/new?template=https://github.com/your-repo/Controller)

## 🔄 Migration from Vercel

If you've already deployed on Vercel and want to migrate to Railway:

1. Deploy to Railway using the steps above
2. Update your desktop app configuration to use the Railway URL
3. Test WebSocket connectivity
4. Update any hardcoded URLs in your application 