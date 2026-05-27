# LottoVision — Deployment Guide

This guide covers deploying the frontend to **Firebase Hosting** and the backend to **Render**.

---

## Prerequisites

- Node.js 18+
- Firebase CLI: `npm install -g firebase-tools`
- A Firebase project (free Spark plan works)
- A Render account (free tier works)

---

## 1. Firebase Project Setup

1. Go to [Firebase Console](https://console.firebase.google.com) → **Add project**
2. Enable **Authentication** → Sign-in method → **Email/Password**
3. Enable **Firestore Database** → Create database → Start in **production mode**
4. Note your **Project ID** (visible in Project Settings)

---

## 2. Backend — Deploy to Render

### 2a. Get your service account key

1. Firebase Console → **Project Settings** → **Service Accounts**
2. Click **Generate new private key** → download the JSON file
3. **Do not commit this file** — it contains secrets

### 2b. Create the Render service

1. Push your repo to GitHub (make sure `serviceAccountKey.json` is in `.gitignore`)
2. [Render Dashboard](https://render.com) → **New +** → **Web Service**
3. Connect your GitHub repo
4. Settings:
   - **Root Directory**: `server`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Environment**: Node

### 2c. Set environment variables in Render

Go to your Render service → **Environment** tab and add:

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `PORT` | `3001` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | *(paste the entire contents of your JSON key file)* |
| `ALLOWED_ORIGIN` | `https://YOUR_PROJECT_ID.web.app` |
| `ADMIN_BOOTSTRAP_EMAIL` | your admin email |

> **Tip for FIREBASE_SERVICE_ACCOUNT_JSON**: Open the downloaded JSON file, select all, copy, and paste as the value. Render stores it as a secret.

### 2d. Note your Render URL

After deploy, Render gives you a URL like `https://lottovision-api.onrender.com`.
You'll need this for step 3.

---

## 3. Frontend — Deploy to Firebase Hosting

### 3a. Update `.firebaserc`

Edit `.firebaserc` and replace `YOUR_FIREBASE_PROJECT_ID` with your actual project ID:

```json
{
  "projects": {
    "default": "your-actual-project-id"
  }
}
```

### 3b. Create a production `.env` file

Create `.env.production` (never commit this file):

```
VITE_BACKEND_URL=https://lottovision-api.onrender.com

VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

Get the Firebase Web SDK values from:
**Firebase Console** → Project Settings → General → **Your apps** → Web app → SDK setup and configuration

### 3c. Build and deploy

```bash
# Install deps if needed
npm install

# Build with production env vars
npm run build

# Login to Firebase (first time only)
firebase login

# Deploy to Firebase Hosting
firebase deploy --only hosting
```

Your app will be live at `https://YOUR_PROJECT_ID.web.app`.

---

## 4. Verify

1. Open `https://YOUR_PROJECT_ID.web.app`
2. Sign in with your admin email
3. Dashboard should load — try **Refresh** and **Run Pipeline**
4. Check Render logs if anything fails: Render Dashboard → your service → **Logs**

---

## 5. Ongoing deploys

**Frontend** (after any code change):
```bash
npm run build && firebase deploy --only hosting
```

**Backend** (Render auto-deploys on git push to main by default):
```bash
git push origin main
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| API calls fail with CORS error | `ALLOWED_ORIGIN` mismatch | Set it to exactly `https://YOUR_PROJECT_ID.web.app` (no trailing slash) |
| `[Firestore] Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON` | Extra whitespace or invalid JSON | Re-paste the JSON key file contents; ensure no line breaks were inserted |
| Firebase Hosting 404 on page refresh | Missing SPA rewrite rule | Ensure `firebase.json` has the `"rewrites"` section pointing to `/index.html` |
| Render service sleeping (free tier) | Render free tier spins down after 15 min inactivity | First request after sleep takes ~30 s; upgrade to paid tier to avoid |
| Pipeline returns stale draw | Scraper blocked | Check Render logs; the scraper targets the public Pais Lotto results page |
