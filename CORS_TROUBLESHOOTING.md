# CORS Troubleshooting Guide

## Issue: CORS errors when accessing backend from Vercel frontend

### Symptoms
- `Access-Control-Allow-Origin header is present on the requested resource`
- `404 Not Found` errors
- `Failed to fetch` errors

## Solutions

### 1. Verify Railway Deployment
The backend must be redeployed on Railway after CORS changes:

1. Go to Railway Dashboard → Your Project
2. Check **Deployments** tab
3. Ensure latest commit `81b71f7` is deployed
4. If not, trigger a redeploy:
   - Go to **Settings** → **Service**
   - Click **Redeploy** or push a new commit

### 2. Test Backend Health Endpoint
Test if backend is accessible:
```bash
curl https://athletic-imagination-production.up.railway.app/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-01-XX...",
  "cors": "enabled"
}
```

### 3. Test CORS Preflight
Test OPTIONS request:
```bash
curl -X OPTIONS https://athletic-imagination-production.up.railway.app/api/organization/register \
  -H "Origin: https://internship-allotment.vercel.app" \
  -H "Access-Control-Request-Method: POST" \
  -v
```

Look for:
- `Access-Control-Allow-Origin: https://internship-allotment.vercel.app`
- `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS, PATCH`

### 4. Check Railway Logs
1. Railway Dashboard → Your Project → **Deployments**
2. Click latest deployment → **View Logs**
3. Look for:
   - `✅ Server running on port XXXX`
   - `✅ Connected to MongoDB`
   - Any CORS-related errors

### 5. Verify Environment Variables in Railway
Ensure these are set in Railway:
- `MONGO_URL` - MongoDB connection string
- `PORT` - Server port (Railway sets this automatically)
- `BACKEND_URL` - Should be your Railway URL

### 6. Check Vercel Environment Variables
In Vercel Dashboard → Your Project → Settings → Environment Variables:
- `VITE_API_BASE_URL` = `https://athletic-imagination-production.up.railway.app`
- Make sure it's set for **Production** environment
- Redeploy Vercel after adding/updating

### 7. Common Issues

#### Issue: Still getting CORS errors after deployment
**Solution**: Clear browser cache or test in incognito mode. CORS headers are cached.

#### Issue: 404 errors
**Solution**: 
- Check Railway logs for route registration
- Verify the route exists in `index.js`
- Ensure Railway is using the latest code

#### Issue: Backend not responding
**Solution**:
- Check Railway service status
- Verify MongoDB connection
- Check Railway resource limits

## Current CORS Configuration

Allowed Origins:
- `https://internship-allotment.vercel.app` (Production)
- `http://localhost:5173` (Local dev)
- `http://localhost:3000` (Alternative local)
- `http://localhost:5174` (Alternative local)

Allowed Methods:
- GET, POST, PUT, DELETE, OPTIONS, PATCH

Allowed Headers:
- Content-Type, Authorization, X-Requested-With, Accept

## Testing Commands

### Test Registration Endpoint
```bash
curl -X POST https://athletic-imagination-production.up.railway.app/api/organization/register \
  -H "Content-Type: application/json" \
  -H "Origin: https://internship-allotment.vercel.app" \
  -d '{
    "orgName": "Test Org",
    "regNumber": "TEST123",
    "country": "India",
    "state": "Test State",
    "address": "Test Address",
    "coordName": "Test Coordinator",
    "coordDesg": "Manager",
    "coordEmail": "test@example.com",
    "coordPhone": "1234567890",
    "password": "test123"
  }'
```

### Check CORS Headers
```bash
curl -I -X OPTIONS https://athletic-imagination-production.up.railway.app/api/organization/register \
  -H "Origin: https://internship-allotment.vercel.app" \
  -H "Access-Control-Request-Method: POST"
```

## Next Steps

1. ✅ Verify Railway has deployed latest code
2. ✅ Test `/health` endpoint
3. ✅ Check Railway logs for errors
4. ✅ Verify Vercel has `VITE_API_BASE_URL` set
5. ✅ Redeploy Vercel frontend
6. ✅ Test in browser (clear cache first)

