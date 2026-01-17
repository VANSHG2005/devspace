# Google OAuth Setup Guide for DevSpace

The error "Access blocked: Authorization Error — no registered origin" means your 
Google OAuth Client ID doesn't have your local dev URL whitelisted.

## Step-by-step fix:

### 1. Go to Google Cloud Console
https://console.cloud.google.com/apis/credentials

### 2. Find your OAuth 2.0 Client ID
Click on the client ID you're using for DevSpace (the one in your .env file)

### 3. Add Authorized JavaScript Origins
Under **"Authorized JavaScript origins"**, click **"+ ADD URI"** and add:
```
http://localhost:5173
http://localhost:3000
```
(Add both to cover all cases)

### 4. Add Authorized Redirect URIs (if needed)
Under **"Authorized redirect URIs"**, add:
```
http://localhost:5173
```

### 5. Save and wait 5 minutes
Google takes up to 5 minutes to propagate changes.

### 6. Check your .env file
Make sure `VITE_GOOGLE_CLIENT_ID` in `frontend/.env` matches exactly what's in Google Console:
```env
VITE_GOOGLE_CLIENT_ID=695152592978-o2qjac9dpc232eip4jf9bt6q7ipkdck9.apps.googleusercontent.com
```
Note: use `.apps.googleusercontent.com` suffix, NOT just the numeric ID.

## Troubleshooting

**Error 401: invalid_client** → Wrong Client ID or origins not configured
**Error: The given origin is not allowed** → Add http://localhost:5173 to authorized origins
**Error: redirect_uri_mismatch** → Add the URI to authorized redirect URIs

## For Production
When you deploy, also add your production URL:
```
https://yourdomain.com
```
