# MyPhoneBridge Web Dashboard

## 🚀 Quick Setup

### 1. Get Firebase Web App ID

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select **myphonebridge** project
3. Click Settings ⚙️ → **Project Settings**
4. Scroll to **Your apps** → Click **Web app** (</> icon)
5. If no web app exists, click **"Add app"** → Name: "MyPhoneBridge Web" → Register
6. Copy the **appId** value (looks like: `1:815562719889:web:abc123...`)

### 2. Update Firebase Config

Edit `public/js/firebase-config.js`:

Replace `YOUR_WEB_APP_ID` with the appId you copied:

```javascript
const firebaseConfig = {
    apiKey: "AIzaSyDZhgdSUJ0U0yoE051E9rTtbe9A4py7g1Y",
    authDomain: "myphonebridge.firebaseapp.com",
    databaseURL: "https://myphonebridge-default-rtdb.firebaseio.com",
    projectId: "myphonebridge",
    storageBucket: "myphonebridge.firebasestorage.app",
    messagingSenderId: "815562719889",
    appId: "1:815562719889:web:YOUR_ACTUAL_APP_ID_HERE"  // ← Replace this
};
```

### 3. Deploy to Vercel

#### Option A: Via Vercel Website (Easiest)

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click **"Add New..." → "Project"**
3. Click **"Import Git Repository"** (or upload folder directly)
4. Select this folder: `MyPhoneBridge-Web`
5. Set **Root Directory** to: `public`
6. Click **"Deploy"**
7. Done! You'll get a URL like: `https://myphonebridge-xxxxx.vercel.app`

#### Option B: Via Vercel CLI

```bash
# Install Vercel CLI
npm install -g vercel

# Navigate to folder
cd MyPhoneBridge-Web

# Deploy
vercel --prod
```

### 4. Test the Dashboard

1. Open your Vercel URL
2. **Sign in** with the same email/password you used in the Android app
3. In the Android app, **generate a pairing code**
4. Enter the code in the web dashboard
5. Click **"Pair Device"**
6. You should see the device status!

---

## 🧪 Local Testing (Optional)

If you want to test locally before deploying:

```bash
cd public
python3 -m http.server 8000

# Or use any local server
```

Then open: `http://localhost:8000`

---

## 🎯 Features (Fase 0)

- ✅ Email/Password login
- ✅ Pairing with 6-digit code
- ✅ Real-time device status
- ✅ Online/offline indicator
- ✅ Last seen timestamp
- ⏳ Remote control (Coming in Fase 1)

---

## 🐛 Troubleshooting

### "Firebase not initialized"
→ Check that `firebase-config.js` has the correct appId

### "Invalid or expired pairing code"
→ Make sure you're logged in with the **same email** as the Android app

### "Device not found"
→ Make sure the Android service is **running** (check notification)

### Pairing code already used
→ Generate a **new code** in the Android app

---

## 🔒 Security Note

For Fase 0, Firestore rules are in TEST mode (allow all). 

**For production**, update Firestore rules to:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

Go to Firebase Console → Firestore → Rules → Paste the above → Publish

---

**Ready to deploy!** 🚀
