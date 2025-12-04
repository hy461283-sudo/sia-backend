# Railway Deployment Setup Guide

## MongoDB Connection Issues

If you see errors like:
- `Connection not authenticating`
- `WiredTiger message`
- `MongoDB connection failed`

## Step 1: Verify MongoDB Service in Railway

1. Go to Railway Dashboard
2. Check if you have a **MongoDB** service added
3. If not, add one:
   - Click **+ New** → **Database** → **Add MongoDB**

## Step 2: Set Environment Variables

In your **Backend Service** (not MongoDB service):

1. Go to **Variables** tab
2. Add/Verify these variables:

### Required Variables:
- `MONGO_URL` - Get this from your MongoDB service:
  - Go to MongoDB service → **Variables** tab
  - Copy the `MONGO_URL` value (it looks like: `mongodb://mongo:27017` or `mongodb+srv://...`)
  - Paste it into your backend service variables

### Optional but Recommended:
- `NODE_ENV` = `production`
- `PORT` - Railway sets this automatically, but you can override
- `BACKEND_URL` = Your Railway public URL (e.g., `https://athletic-imagination-production.up.railway.app`)

## Step 3: MongoDB Connection String Format

Railway MongoDB typically provides:
- **Internal URL**: `mongodb://mongo:27017/railway` (for services in same project)
- **External URL**: `mongodb+srv://user:pass@cluster.mongodb.net/railway` (MongoDB Atlas)

### For Railway MongoDB (Same Project):
```bash
MONGO_URL=mongodb://mongo:27017/railway
```

### For MongoDB Atlas:
```bash
MONGO_URL=mongodb+srv://username:password@cluster.mongodb.net/database?retryWrites=true&w=majority
```

## Step 4: Verify Connection

After setting `MONGO_URL`, check Railway logs:
- Should see: `✅ Connected to MongoDB`
- Should NOT see: `❌ MongoDB connection failed`

## Step 5: Common Issues

### Issue: "Connection not authenticating"
**Solution**: 
- Verify `MONGO_URL` includes username/password if required
- Check MongoDB service is running
- Ensure MongoDB service is in the same Railway project

### Issue: SIGTERM errors
**Solution**: 
- This is normal - Railway sends SIGTERM during deployments
- The code now handles this gracefully
- Check if the server restarts successfully

### Issue: Server keeps restarting
**Solution**:
- Check Railway logs for error messages
- Verify all environment variables are set
- Check MongoDB connection string format

## Step 6: Test Deployment

1. Check Railway logs for:
   ```
   ✅ Server running on port XXXX
   ✅ Connected to MongoDB
   ```

2. Test health endpoint:
   ```bash
   curl https://your-railway-url.railway.app/health
   ```

3. Test CORS:
   ```bash
   curl -X OPTIONS https://your-railway-url.railway.app/api/organization/login \
     -H "Origin: https://internship-allotment.vercel.app" \
     -H "Access-Control-Request-Method: POST" -v
   ```

## Environment Variables Checklist

- [ ] `MONGO_URL` - MongoDB connection string
- [ ] `PORT` - Server port (Railway sets automatically)
- [ ] `BACKEND_URL` - Your Railway public URL (optional)
- [ ] `NODE_ENV` - Set to `production` (optional)

## Railway Service Structure

```
Railway Project
├── MongoDB Service (Database)
│   └── Provides: MONGO_URL
└── Backend Service (Node.js)
    └── Uses: MONGO_URL from MongoDB service
```

## Need Help?

1. Check Railway logs: **Deployments** → **View Logs**
2. Check MongoDB service status
3. Verify environment variables are set correctly
4. Test MongoDB connection string locally if possible

