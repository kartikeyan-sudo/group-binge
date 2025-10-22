# 🚂 Railway Deployment Checklist

## ⚠️ Current Issue: ERR_NAME_NOT_RESOLVED

Your Railway deployment needs to be properly configured. Follow these steps:

---

## 📋 Step-by-Step Railway Setup:

### 1. Go to Railway Dashboard
Visit: https://railway.app/dashboard

### 2. Check Your Project Status

**Look for:**
- Is there a project named `group-binge`?
- Is the deployment showing **"Active"** or **"Failed"**?
- What does the deployment log say?

### 3. If Deployment Failed or Doesn't Exist:

#### Option A: Create New Project from GitHub
1. Click **"New Project"**
2. Select **"Deploy from GitHub repo"**
3. Choose **`kartikeyan-sudo/group-binge`**
4. Railway will auto-detect it's a Node.js app

#### Option B: If Project Exists but Failed
1. Click on your project
2. Go to **"Deployments"** tab
3. Click on the failed deployment to see logs
4. Look for error messages

### 4. ⚙️ Configure Environment Variables (CRITICAL!)

Click on your service → **"Variables"** tab → Add these:

```
MONGODB_URI=mongodb+srv://kartikeyandubey61:cQeQXqHlpEMRsifg@cluster1.ul15v2w.mongodb.net/group-binge
PORT=4001
NODE_ENV=production
```

**Important:** Without `MONGODB_URI`, your server will crash!

### 5. 🌐 Generate Public Domain

1. Click **"Settings"** tab
2. Scroll to **"Networking"** section
3. Click **"Generate Domain"**
4. Copy the generated URL (e.g., `group-binge-production-abc123.up.railway.app`)

### 6. ✅ Verify Deployment

**Check deployment logs:**
1. Go to **"Deployments"** tab
2. Click on the latest deployment
3. Look for:
   ```
   ✅ Server is running on port 4001
   ✅ Connected to MongoDB successfully
   ```

**If you see errors like:**
- ❌ "Cannot find module" → Railway didn't install dependencies
- ❌ "MONGODB_URI is not defined" → Environment variables missing
- ❌ "Port in use" → Change PORT variable to something else

### 7. 🧪 Test Your Backend

Once deployed, test the URL in your browser:
```
https://YOUR-RAILWAY-URL.up.railway.app
```

You should see something (even an error page is OK), not "Cannot resolve".

**Test API endpoint:**
```
https://YOUR-RAILWAY-URL.up.railway.app/api
```

### 8. 📝 Update Frontend (Once You Have the Real URL)

Copy your ACTUAL Railway URL and run:
```powershell
# I'll update index.html with the correct URL
# Just paste the URL here in chat
```

---

## 🔍 Common Issues & Solutions:

### Issue 1: "ERR_NAME_NOT_RESOLVED"
**Cause:** Railway domain doesn't exist or wasn't generated
**Solution:** Generate domain in Railway Settings → Networking

### Issue 2: "Application failed to respond"
**Cause:** Server crashed, probably due to missing environment variables
**Solution:** Add MONGODB_URI in Railway Variables tab

### Issue 3: "Build failed"
**Cause:** Missing dependencies or wrong Node version
**Solution:** Railway should auto-detect from package.json, but you can specify:
- Add `"engines": { "node": "18.x" }` to package.json if needed

### Issue 4: "MongoDB connection failed"
**Cause:** MongoDB Atlas IP whitelist or wrong connection string
**Solution:** 
- In MongoDB Atlas, go to Network Access
- Click "Add IP Address"
- Select "Allow Access from Anywhere" (0.0.0.0/0)

---

## 📸 What to Look For:

In Railway dashboard, you should see:
- ✅ **Status:** Active (green indicator)
- ✅ **Deployments:** Latest showing "Success"
- ✅ **Domain:** A public URL generated
- ✅ **Logs:** "Server is running" messages

---

## 🆘 Still Not Working?

Share with me:
1. Screenshot of Railway deployment page
2. Railway deployment logs (copy the text)
3. The exact URL Railway generated for you

I'll help you debug! 🚀
