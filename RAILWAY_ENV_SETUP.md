# Railway Environment Variables Setup

## Backend Service Variables

Set these in your **Backend Service** (not MongoDB service):

### Required:
```
MONGO_URL=mongodb://mongo:XHrsbCliYRvfrkCJAdnQMJplHvAKRMZI@mongodb.railway.internal:27017
```

### Optional but Recommended:
```
NODE_ENV=production
BACKEND_URL=https://athletic-imagination-production.up.railway.app
```

## How to Set in Railway:

1. Go to Railway Dashboard
2. Click on your **Backend Service** (not MongoDB service)
3. Go to **Variables** tab
4. Click **+ New Variable**
5. Add:
   - **Name**: `MONGO_URL`
   - **Value**: `mongodb://mongo:XHrsbCliYRvfrkCJAdnQMJplHvAKRMZI@mongodb.railway.internal:27017`
   - **Service**: Select your backend service
6. Click **Add**

## Important Notes:

- ✅ This is the **internal** Railway MongoDB connection string
- ✅ It will only work for services in the **same Railway project**
- ✅ Railway automatically sets `PORT` - you don't need to set it
- ✅ After adding `MONGO_URL`, Railway will auto-redeploy

## Verify Setup:

After setting `MONGO_URL`, check Railway logs:
- Should see: `✅ Connected to MongoDB`
- Should see: `📍 MongoDB URI: mongodb://***:***@mongodb.railway.internal:27017` (credentials hidden)
- Should NOT see: `❌ MongoDB connection failed`

## If Connection Still Fails:

1. Verify MongoDB service is running (Railway Dashboard)
2. Check both services are in the same Railway project
3. Try using the public MongoDB URL instead (if available)
4. Check Railway logs for specific error messages

