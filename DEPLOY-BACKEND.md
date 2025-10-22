# Backend Deployment Guide

## The Problem
Your frontend is hosted on Netlify at `https://bingewithus.netlify.app`, but your Node.js backend (Express + Socket.IO + MongoDB) needs to be deployed separately.

## Quick Solution: Deploy Backend to Render.com (FREE)

### Step 1: Sign up for Render.com
1. Go to https://render.com
2. Sign up with your GitHub account

### Step 2: Create a New Web Service
1. Click "New +" → "Web Service"
2. Connect your GitHub repository: `kartikeyan-sudo/group-binge`
3. Configure the service:
   - **Name**: `binge-server` (or any name you like)
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Plan**: Free

### Step 3: Add Environment Variables
In the "Environment" section, add:
- `MONGODB_URI` = `mongodb+srv://kartikeyandubey61:cQeQXqHlpEMRsifg@cluster1.ul15v2w.mongodb.net/`
- `PORT` = `4001` (or leave default)
- `NODE_ENV` = `production`

### Step 4: Deploy
Click "Create Web Service" and wait for deployment (2-5 minutes)

### Step 5: Get Your Backend URL
After deployment, Render will give you a URL like:
```
https://binge-server.onrender.com
```

### Step 6: Update index.html
Replace line 138 in `index.html`:
```javascript
window.BINGE_BACKEND = 'https://binge-server.onrender.com'; // Your Render URL
```

### Step 7: Commit and Push
```bash
git add index.html
git commit -m "Update backend URL for production"
git push origin main
```

Netlify will auto-deploy your updated frontend!

---

## Alternative: Deploy to Railway.app

### Quick Steps:
1. Go to https://railway.app
2. "New Project" → "Deploy from GitHub repo"
3. Select `kartikeyan-sudo/group-binge`
4. Add environment variables (same as above)
5. Get your railway URL: `https://your-app.up.railway.app`
6. Update `index.html` with this URL

---

## Alternative: Deploy to Fly.io

```bash
# Install flyctl
iwr https://fly.io/install.ps1 -useb | iex

# Login
fly auth login

# Launch (creates fly.toml)
fly launch

# Set secrets
fly secrets set MONGODB_URI="mongodb+srv://kartikeyandubey61:cQeQXqHlpEMRsifg@cluster1.ul15v2w.mongodb.net/"

# Deploy
fly deploy
```

---

## Testing After Deployment

1. Visit your Render/Railway/Fly URL directly: `https://your-backend.com`
2. Test the API: `https://your-backend.com/api/rooms` (should return 404 or error, but not connection refused)
3. Update `index.html` with the backend URL
4. Push to GitHub
5. Visit https://bingewithus.netlify.app
6. Check browser console - should now connect successfully!

---

## Important Notes

### CORS Configuration
Your `server.js` already has CORS configured to accept all origins:
```javascript
app.use(cors());
```

This is fine for development, but in production you should restrict it:
```javascript
app.use(cors({
  origin: 'https://bingewithus.netlify.app',
  credentials: true
}));
```

### MongoDB Atlas IP Whitelist
Make sure MongoDB Atlas allows connections from anywhere (0.0.0.0/0) or add your hosting service's IP addresses.

### Environment Variables
Never commit `.env` file to GitHub! Always use hosting platform's environment variable settings.
